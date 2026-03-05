/**
 * Browser DOM runtime — createRoot + real DOM commit.
 *
 * This is the browser entry point for mreact.ts.
 * It provides:
 *   - createRoot(container) → { render(element), unmount() }
 *   - Real DOM operations (createElement, event delegation, etc.)
 *
 * Usage:
 *   import { createRoot } from "@mreact/dom/client";
 *   const root = createRoot(document.getElementById("app")!);
 *   root.render(h(App, {}));
 */

import type { MElement, FiberNode } from "@mreact/core";
import { mount } from "@mreact/core";

// ============================================================================
// Types
// ============================================================================

export interface Root {
	render: (element: MElement) => void;
	unmount: () => void;
}

// ============================================================================
// Commit — apply fiber mutations to the real browser DOM
// ============================================================================

const commitToBrowser = (rootFiber: FiberNode, container: unknown): void => {
	const containerNode = container as HTMLElement;

	// Clear container on first mount
	if (!rootFiber.stateNode) {
		containerNode.innerHTML = "";
		rootFiber.stateNode = containerNode;
	}

	commitBrowserFiber(rootFiber.child, containerNode);
};

const commitBrowserFiber = (
	fiber: FiberNode | null,
	parentNode: HTMLElement,
): void => {
	if (!fiber) return;

	// Process deletions first
	for (const del of fiber.deletions) {
		commitDeletion(del, parentNode);
	}
	fiber.deletions = [];

	switch (fiber.effectTag) {
		case "placement": {
			if (fiber.tag === "host" || fiber.tag === "text") {
				const node = createBrowserNode(fiber);
				if (node) {
					fiber.stateNode = node;
					parentNode.appendChild(node);
				}
				// Children are already appended inside createBrowserNode,
				// so only traverse siblings
				commitBrowserFiber(fiber.sibling, parentNode);
				return;
			}
			break;
		}
		case "update": {
			if (fiber.tag === "text" && fiber.stateNode) {
				(fiber.stateNode as Text).textContent =
					fiber.props.content as string;
			} else if (fiber.tag === "host" && fiber.stateNode) {
				updateBrowserProps(
					fiber.stateNode as HTMLElement,
					fiber.props,
				);
			}
			break;
		}
		case "deletion": {
			commitDeletion(fiber, parentNode);
			return;
		}
	}

	const nextParent =
		fiber.tag === "host" && fiber.stateNode
			? (fiber.stateNode as HTMLElement)
			: parentNode;

	commitBrowserFiber(fiber.child, nextParent);
	commitBrowserFiber(fiber.sibling, parentNode);
};

const commitDeletion = (
	fiber: FiberNode,
	_parentDom: HTMLElement,
): void => {
	// Find the nearest DOM node to remove
	const node = findDOMNode(fiber);
	if (node && node.parentNode) {
		node.parentNode.removeChild(node);
	}
};

const findDOMNode = (fiber: FiberNode): Node | null => {
	if (fiber.stateNode) return fiber.stateNode as Node;
	// For function/fragment fibers, find the first child with a DOM node
	let child = fiber.child;
	while (child) {
		const node = findDOMNode(child);
		if (node) return node;
		child = child.sibling;
	}
	return null;
};

// ============================================================================
// DOM node creation with event handling
// ============================================================================

const createBrowserNode = (fiber: FiberNode): Node | null => {
	if (fiber.tag === "text") {
		return document.createTextNode(fiber.props.content as string);
	}
	if (fiber.tag === "host") {
		const el = document.createElement(fiber.type as string);
		updateBrowserProps(el, fiber.props);
		// Recursively append children that are already created
		appendChildren(fiber, el);
		return el;
	}
	return null;
};

const appendChildren = (fiber: FiberNode, parentEl: HTMLElement): void => {
	let child = fiber.child;
	while (child) {
		if (child.tag === "host" || child.tag === "text") {
			const node = createBrowserNode(child);
			if (node) {
				child.stateNode = node;
				parentEl.appendChild(node);
			}
		} else {
			// Fragment, function component, etc. — recurse into children
			appendChildren(child, parentEl);
		}
		child = child.sibling;
	}
};

const updateBrowserProps = (
	el: HTMLElement,
	props: Record<string, unknown>,
): void => {
	for (const [key, value] of Object.entries(props)) {
		if (key === "children" || key === "key") continue;

		if (key.startsWith("on") && typeof value === "function") {
			// Event handler: onClick → click, onInput → input, etc.
			const eventName = key.slice(2).toLowerCase();
			// Remove old listener if exists
			const existingKey = `__mreact_${eventName}` as keyof HTMLElement;
			const oldHandler = (el as Record<string, unknown>)[existingKey];
			if (oldHandler) {
				el.removeEventListener(
					eventName,
					oldHandler as EventListener,
				);
			}
			// Wrap to create DOMEvent
			const handler = (e: Event) => {
				(value as (ev: { type: string; target: string }) => void)({
					type: e.type,
					target:
						(e.target as HTMLInputElement)?.value ??
						(e.target as HTMLElement)?.tagName ??
						"",
				});
			};
			el.addEventListener(eventName, handler);
			(el as Record<string, unknown>)[existingKey] = handler;
		} else if (key === "class") {
			el.className = value as string;
		} else if (key === "for") {
			(el as HTMLLabelElement).htmlFor = value as string;
		} else if (key === "style" && typeof value === "string") {
			el.setAttribute("style", value);
		} else if (typeof value === "string") {
			el.setAttribute(key, value);
		} else if (typeof value === "boolean") {
			if (value) {
				el.setAttribute(key, "");
			} else {
				el.removeAttribute(key);
			}
		}
	}
};

// ============================================================================
// createRoot — React-like API
// ============================================================================

export const createRoot = (container: HTMLElement): Root => {
	let app: ReturnType<typeof mount> | null = null;

	return {
		render: (element: MElement) => {
			app = mount(element, container, commitToBrowser);
		},
		unmount: () => {
			if (container) {
				container.innerHTML = "";
			}
			app = null;
		},
	};
};
