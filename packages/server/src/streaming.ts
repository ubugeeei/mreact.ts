/**
 * Streaming SSR — Suspense-integrated streaming server rendering.
 *
 * Renders the fiber tree to an HTML stream, with Suspense boundaries
 * producing placeholder HTML that gets replaced when the suspended
 * content resolves.
 *
 * Flow:
 *   1. Render synchronous parts immediately → flush HTML
 *   2. Suspense fallbacks become `<template>` placeholders
 *   3. When suspended content resolves, stream replacement `<script>` tags
 *   4. Client-side script swaps the placeholder with real content
 *
 * This matches React's streaming SSR approach (renderToPipeableStream).
 */

import type { MElement, FiberNode } from "@mreact/core";
import { createRootFiber, reconcileElement, SuspendException } from "@mreact/core";

// ============================================================================
// Types
// ============================================================================

export interface StreamController {
	/** Write a chunk to the stream. */
	write: (chunk: string) => void;
	/** Close the stream. */
	close: () => void;
}

export interface StreamingResult {
	/** Shell HTML (synchronous content + Suspense fallbacks). */
	shell: string;
	/** Pending Suspense boundaries that will stream in later. */
	pendingBoundaries: SuspenseBoundary[];
	/** Wait for all boundaries to resolve. */
	allReady: Promise<void>;
}

export interface SuspenseBoundary {
	id: string;
	promise: Promise<unknown>;
	fallbackHTML: string;
	resolve: () => Promise<string>;
}

// ============================================================================
// Streaming renderer
// ============================================================================

let boundaryIdCounter = 0;

export const renderToStream = (element: MElement): StreamingResult => {
	const boundaries: SuspenseBoundary[] = [];
	const shell = renderElementToStream(element, boundaries);

	const allReady =
		boundaries.length === 0
			? Promise.resolve()
			: Promise.all(boundaries.map((b) => b.promise)).then(() => {});

	return { shell, pendingBoundaries: boundaries, allReady };
};

const renderElementToStream = (
	element: MElement,
	boundaries: SuspenseBoundary[],
): string => {
	if (element === null) return "";

	switch (element.kind) {
		case "text":
			return escapeHTML(element.content);

		case "host": {
			const tag = element.type;
			const attrs = renderAttrs(element.props);
			const children = element.children
				.map((c) => renderElementToStream(c, boundaries))
				.join("");
			return `<${tag}${attrs}>${children}</${tag}>`;
		}

		case "component": {
			// Try to render the component; if it suspends, it should be
			// caught by a parent Suspense boundary
			const rootFiber = createRootFiber();
			rootFiber.scheduleUpdate = () => {};
			const childFiber = reconcileElement(element, null, rootFiber);
			rootFiber.child = childFiber;
			return fiberToStreamHTML(rootFiber.child, boundaries);
		}

		case "fragment":
			return element.children
				.map((c) => renderElementToStream(c, boundaries))
				.join("");

		case "suspense":
			return renderSuspenseBoundary(element, boundaries);

		case "server":
			return `<!--server-component-pending-->`;
	}
};

const renderSuspenseBoundary = (
	element: Extract<MElement, { kind: "suspense" }>,
	boundaries: SuspenseBoundary[],
): string => {
	const boundaryId = `B:${boundaryIdCounter++}`;

	try {
		// Try rendering children synchronously
		const content = element.children
			.map((c) => renderElementToStream(c, boundaries))
			.join("");
		return content;
	} catch (e) {
		if (e instanceof SuspendException) {
			// Children suspended — render fallback and register boundary
			const fallbackHTML = element.fallback
				? renderElementToStream(element.fallback, boundaries)
				: "";

			const boundary: SuspenseBoundary = {
				id: boundaryId,
				promise: e.promise,
				fallbackHTML,
				resolve: async () => {
					// Wait for the promise to resolve, then re-render
					await e.promise;
					return element.children
						.map((c) => renderElementToStream(c, []))
						.join("");
				},
			};

			boundaries.push(boundary);

			// Return fallback with a replacement marker
			return (
				`<!--$?--><template id="${boundaryId}"></template>` +
				fallbackHTML +
				`<!--/$-->`
			);
		}
		throw e;
	}
};

const fiberToStreamHTML = (
	fiber: FiberNode | null,
	_boundaries: SuspenseBoundary[],
): string => {
	if (!fiber) return "";

	switch (fiber.tag) {
		case "text":
			return escapeHTML(fiber.props.content as string);
		case "host": {
			const tag = fiber.type as string;
			const attrs = renderAttrs(fiber.props);
			let children = "";
			let child = fiber.child;
			while (child) {
				children += fiberToStreamHTML(child, _boundaries);
				child = child.sibling;
			}
			return `<${tag}${attrs}>${children}</${tag}>`;
		}
		default: {
			let children = "";
			let child = fiber.child;
			while (child) {
				children += fiberToStreamHTML(child, _boundaries);
				child = child.sibling;
			}
			return children;
		}
	}
};

// ============================================================================
// Streaming to a controller (pipe-like API)
// ============================================================================

export const renderToPipeableStream = (
	element: MElement,
	controller: StreamController,
): { allReady: Promise<void> } => {
	const { shell, pendingBoundaries, allReady } = renderToStream(element);

	// Write shell immediately
	controller.write(shell);

	// Stream in resolved boundaries
	const streamBoundaries = async () => {
		for (const boundary of pendingBoundaries) {
			try {
				const content = await boundary.resolve();
				// Send replacement script
				controller.write(
					`<div hidden id="${boundary.id}-content">${content}</div>` +
						`<script>` +
						`(function(){` +
						`var t=document.getElementById("${boundary.id}");` +
						`var c=document.getElementById("${boundary.id}-content");` +
						`if(t&&c){` +
						`var p=t.parentNode;` +
						`var f=t.nextSibling;` +
						`while(f&&!(f.nodeType===8&&f.data==="/$")){` +
						`var n=f.nextSibling;p.removeChild(f);f=n;` +
						`}` +
						`if(f)p.removeChild(f);` +
						`p.removeChild(t);` +
						`while(c.firstChild)p.insertBefore(c.firstChild,null);` +
						`c.remove();` +
						`}` +
						`})()` +
						`</script>`,
				);
			} catch {
				// Boundary failed — leave fallback in place
			}
		}
		controller.close();
	};

	streamBoundaries();

	return { allReady };
};

// ============================================================================
// Helpers
// ============================================================================

const renderAttrs = (props: Record<string, unknown>): string => {
	let result = "";
	for (const [k, v] of Object.entries(props)) {
		if (k === "children" || k === "key" || typeof v === "function") continue;
		if (typeof v === "string") {
			result += ` ${k}="${escapeHTML(v)}"`;
		} else if (typeof v === "boolean" && v) {
			result += ` ${k}`;
		}
	}
	return result;
};

const escapeHTML = (s: string): string =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
