/**
 * Commit phase — apply fiber mutations to the real DOM.
 *
 * Walks the fiber tree and applies placement, update, deletion
 * based on each fiber's effectTag.
 */

import type { FiberNode } from "./fiber.ts";

// ============================================================================
// Types
// ============================================================================

export interface DOMOperations {
	createElement: (tag: string) => unknown;
	createTextNode: (text: string) => unknown;
	appendChild: (parent: unknown, child: unknown) => void;
	removeChild: (parent: unknown, child: unknown) => void;
	replaceChild: (parent: unknown, newChild: unknown, oldChild: unknown) => void;
	setAttribute: (node: unknown, key: string, value: string) => void;
	removeAttribute: (node: unknown, key: string) => void;
	setTextContent: (node: unknown, text: string) => void;
}

// ============================================================================
// Logging backend (for testing / GHC-like backend)
// ============================================================================

export type CommitLog = CommitEntry[];

export interface CommitEntry {
	type: "placement" | "update" | "deletion";
	fiberTag: string;
	fiberType: string | null;
	props: Record<string, unknown>;
}

export const createLoggingCommit = (
	log: CommitLog,
): ((rootFiber: FiberNode, container: unknown) => void) => {
	return (rootFiber: FiberNode, _container: unknown) => {
		commitFiber(rootFiber.child, log);
	};
};

const commitFiber = (
	fiber: FiberNode | null,
	log: CommitLog,
): void => {
	if (!fiber) return;

	if (fiber.effectTag !== "none") {
		log.push({
			type: fiber.effectTag as CommitEntry["type"],
			fiberTag: fiber.tag,
			fiberType: typeof fiber.type === "string" ? fiber.type : null,
			props: { ...fiber.props },
		});
	}

	commitFiber(fiber.child, log);
	commitFiber(fiber.sibling, log);
};

// ============================================================================
// DOM commit (browser)
// ============================================================================

export const commitWork = (
	fiber: FiberNode | null,
	ops: DOMOperations,
	parentNode: unknown,
): void => {
	if (!fiber) return;

	switch (fiber.effectTag) {
		case "placement": {
			const node = createDOMNode(fiber, ops);
			fiber.stateNode = node;
			if (parentNode) ops.appendChild(parentNode, node);
			break;
		}
		case "update": {
			if (fiber.tag === "text" && fiber.stateNode) {
				ops.setTextContent(
					fiber.stateNode,
					fiber.props.content as string,
				);
			} else if (fiber.tag === "host" && fiber.stateNode) {
				updateDOMProps(fiber.stateNode, fiber.props, ops);
			}
			break;
		}
		case "deletion": {
			if (fiber.stateNode && parentNode) {
				ops.removeChild(parentNode, fiber.stateNode);
			}
			return;
		}
	}

	const nextParent =
		fiber.tag === "host" || fiber.tag === "root"
			? fiber.stateNode ?? parentNode
			: parentNode;

	commitWork(fiber.child, ops, nextParent);
	commitWork(fiber.sibling, ops, parentNode);
};

export const commitDeletion = (
	fiber: FiberNode,
	ops: DOMOperations,
	parentNode: unknown,
): void => {
	if (fiber.stateNode) {
		ops.removeChild(parentNode, fiber.stateNode);
	} else if (fiber.child) {
		commitDeletion(fiber.child, ops, parentNode);
	}
};

// ============================================================================
// DOM node creation
// ============================================================================

const createDOMNode = (
	fiber: FiberNode,
	ops: DOMOperations,
): unknown => {
	if (fiber.tag === "text") {
		return ops.createTextNode(fiber.props.content as string);
	}
	if (fiber.tag === "host") {
		const node = ops.createElement(fiber.type as string);
		updateDOMProps(node, fiber.props, ops);
		return node;
	}
	return null;
};

const updateDOMProps = (
	node: unknown,
	props: Record<string, unknown>,
	ops: DOMOperations,
): void => {
	for (const [k, v] of Object.entries(props)) {
		if (k === "children" || k === "key") continue;
		if (typeof v === "string") {
			ops.setAttribute(node, k, v);
		}
	}
};
