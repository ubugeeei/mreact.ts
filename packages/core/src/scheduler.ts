/**
 * Scheduler — work loop and render pipeline.
 *
 * The rendering pipeline:
 *   u_s = commit . reconcile . render(s)
 *
 * Idempotency: u_s . u_s = u_s
 *
 * The scheduler manages:
 *   1. Work queue (pending re-renders)
 *   2. Work loop (process fibers incrementally)
 *   3. Commit phase delegation
 */

import type { MElement } from "./element.ts";
import {
	type FiberNode,
	createRootFiber,
	collectEffects,
} from "./fiber.ts";
import { reconcileElement } from "./reconciler.ts";

// ============================================================================
// Types
// ============================================================================

export interface MountedApp {
	rootFiber: FiberNode;
	element: MElement;
	container: unknown;
	commitFn: CommitFn;
}

export type CommitFn = (fiber: FiberNode, container: unknown) => void;

// ============================================================================
// Mount — create root and perform initial render
// ============================================================================

export const mount = (
	element: MElement,
	container: unknown,
	commitFn: CommitFn,
): MountedApp => {
	const rootFiber = createRootFiber();
	rootFiber.stateNode = container;

	const app: MountedApp = { rootFiber, element, container, commitFn };

	// Wire up schedule callback
	rootFiber.scheduleUpdate = () => performUpdate(app);

	// Initial render
	performUpdate(app);

	return app;
};

// ============================================================================
// Render pipeline: u_s = commit . reconcile . render(s)
// ============================================================================

export const performUpdate = (app: MountedApp): void => {
	const { rootFiber, element } = app;

	// Step 1 + 2: Reconcile (builds/updates fiber tree from elements)
	const childFiber = reconcileElement(
		element,
		rootFiber.child,
		rootFiber,
	);
	rootFiber.child = childFiber;

	// Mark first render complete for all new fibers
	markRenderComplete(rootFiber);

	// Step 3: Commit — apply mutations
	const effects = collectEffects(rootFiber);

	// Run layout effects synchronously
	for (const fiber of effects) {
		for (const entry of fiber.pendingEffects) {
			if (entry.phase === "layout") {
				entry.cleanup();
				const newCleanup = entry.action();
				entry.cleanup = newCleanup;
			}
		}
	}

	// Apply DOM mutations via commit function
	app.commitFn(rootFiber, app.container);

	// Run passive effects asynchronously
	for (const fiber of effects) {
		for (const entry of fiber.pendingEffects) {
			if (entry.phase === "passive") {
				entry.cleanup();
				const newCleanup = entry.action();
				entry.cleanup = newCleanup;
			}
		}
		fiber.pendingEffects = [];
	}

	// Reset effect tags
	resetEffectTags(rootFiber);
};

// ============================================================================
// Helpers
// ============================================================================

const markRenderComplete = (fiber: FiberNode | null): void => {
	if (!fiber) return;
	fiber.isFirstRender = false;
	markRenderComplete(fiber.child);
	markRenderComplete(fiber.sibling);
};

const resetEffectTags = (fiber: FiberNode | null): void => {
	if (!fiber) return;
	fiber.effectTag = "none";
	resetEffectTags(fiber.child);
	resetEffectTags(fiber.sibling);
};

// ============================================================================
// SSR — renderToString (synchronous server rendering)
// ============================================================================

export const renderToString = (element: MElement): string => {
	const rootFiber = createRootFiber();
	rootFiber.scheduleUpdate = () => {};

	const childFiber = reconcileElement(element, null, rootFiber);
	rootFiber.child = childFiber;

	return fiberToHTML(rootFiber.child);
};

const fiberToHTML = (fiber: FiberNode | null): string => {
	if (!fiber) return "";

	switch (fiber.tag) {
		case "text":
			return escapeHTML(fiber.props.content as string);
		case "host": {
			const tag = fiber.type as string;
			const attrs = renderAttrs(fiber.props);
			const children = childrenToHTML(fiber);
			return `<${tag}${attrs}>${children}</${tag}>`;
		}
		case "function":
		case "fragment":
		case "root":
		case "suspense":
		case "server":
			return childrenToHTML(fiber);
	}
};

const childrenToHTML = (fiber: FiberNode): string => {
	let html = "";
	let child = fiber.child;
	while (child) {
		html += fiberToHTML(child);
		child = child.sibling;
	}
	return html;
};

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
