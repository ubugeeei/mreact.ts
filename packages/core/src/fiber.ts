/**
 * FiberNode — the reconciliation unit and rendering target.
 *
 * Each FiberNode represents one unit of work in the render tree.
 * Fiber nodes form a tree via child/sibling/return pointers.
 * Double buffering via `alternate` enables concurrent rendering.
 *
 * The fiber IS the effect handler's internal state — it holds
 * the hook store that the algebraic effect handler (reconciler) uses.
 */

import type { MElement, ComponentFn, ServerComponentFn, Props } from "./element.ts";

// ============================================================================
// Types
// ============================================================================

export type FiberTag =
	| "host"
	| "function"
	| "text"
	| "root"
	| "fragment"
	| "suspense"
	| "server";

export type EffectTag = "none" | "placement" | "update" | "deletion";

export type EffectPhase = "passive" | "layout";

export interface EffectEntry {
	phase: EffectPhase;
	action: () => () => void;
	cleanup: () => void;
	prevDeps: unknown;
}

export interface FiberNode {
	tag: FiberTag;
	type: string | ComponentFn | ServerComponentFn | null;
	props: Props;
	key: string | null;

	// Tree structure
	child: FiberNode | null;
	sibling: FiberNode | null;
	return: FiberNode | null;

	// Double buffering for concurrent rendering
	alternate: FiberNode | null;

	// DOM node (for host fibers)
	stateNode: unknown;

	// Hook state — the indexed monad's state, managed by effect handler
	hookStore: unknown[];
	hookCursor: number;
	isFirstRender: boolean;

	// Effect tags for commit phase
	effectTag: EffectTag;
	pendingEffects: EffectEntry[];

	// For function components: the component generator factory
	component: ComponentFn | null;

	// For server components
	serverComponent: ServerComponentFn | null;
	serverResult: MElement | null;

	// Suspense state
	suspenseFallback: MElement | null;
	isSuspended: boolean;
	pendingPromises: Promise<unknown>[];

	// Effect list for commit phase (linked list)
	firstEffect: FiberNode | null;
	lastEffect: FiberNode | null;
	nextEffect: FiberNode | null;

	// ID generation
	idCounter: number;

	// Fibers to delete during commit
	deletions: FiberNode[];

	// Schedule re-render callback
	scheduleUpdate: (() => void) | null;
}

// ============================================================================
// Constructors
// ============================================================================

export const createFiber = (
	tag: FiberTag,
	type: FiberNode["type"],
	props: Props,
): FiberNode => ({
	tag,
	type,
	props,
	key: (props.key as string) ?? null,
	child: null,
	sibling: null,
	return: null,
	alternate: null,
	stateNode: null,
	hookStore: [],
	hookCursor: 0,
	isFirstRender: true,
	effectTag: "none",
	pendingEffects: [],
	component: null,
	serverComponent: null,
	serverResult: null,
	suspenseFallback: null,
	isSuspended: false,
	pendingPromises: [],
	firstEffect: null,
	lastEffect: null,
	nextEffect: null,
	idCounter: 0,
	deletions: [],
	scheduleUpdate: null,
});

export const createHostFiber = (
	type: string,
	props: Props,
	children: MElement[],
): FiberNode => {
	const fiber = createFiber("host", type, { ...props, children });
	return fiber;
};

export const createFunctionFiber = (
	component: ComponentFn,
	props: Props,
): FiberNode => {
	const fiber = createFiber("function", component, props);
	fiber.component = component;
	return fiber;
};

export const createTextFiber = (content: string): FiberNode => {
	const fiber = createFiber("text", null, { content });
	return fiber;
};

export const createRootFiber = (): FiberNode => {
	const fiber = createFiber("root", null, {});
	return fiber;
};

export const createFragmentFiber = (children: MElement[]): FiberNode => {
	const fiber = createFiber("fragment", null, { children });
	return fiber;
};

export const createSuspenseFiber = (
	fallback: MElement,
	children: MElement[],
): FiberNode => {
	const fiber = createFiber("suspense", null, { children });
	fiber.suspenseFallback = fallback;
	return fiber;
};

export const createServerFiber = (
	component: ServerComponentFn,
	props: Props,
): FiberNode => {
	const fiber = createFiber("server", component, props);
	fiber.serverComponent = component;
	return fiber;
};

// ============================================================================
// Fiber tree utilities
// ============================================================================

export const resetHookCursor = (fiber: FiberNode): void => {
	fiber.hookCursor = 0;
};

export const readHook = (fiber: FiberNode, index: number): unknown => {
	if (index >= fiber.hookStore.length) {
		throw new Error(
			`Fiber hook index out of bounds: ${index} (store size: ${fiber.hookStore.length})`,
		);
	}
	return fiber.hookStore[index];
};

export const writeHook = (
	fiber: FiberNode,
	index: number,
	value: unknown,
): void => {
	fiber.hookStore[index] = value;
};

export const appendHook = (fiber: FiberNode, value: unknown): number => {
	const index = fiber.hookStore.length;
	fiber.hookStore.push(value);
	return index;
};

/** Collect all fibers with effect tags into a list for the commit phase. */
export const collectEffects = (fiber: FiberNode): FiberNode[] => {
	const effects: FiberNode[] = [];
	const walk = (f: FiberNode | null): void => {
		if (!f) return;
		if (f.effectTag !== "none") effects.push(f);
		walk(f.child);
		walk(f.sibling);
	};
	walk(fiber);
	return effects;
};
