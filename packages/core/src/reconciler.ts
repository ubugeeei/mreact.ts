/**
 * Reconciler — the algebraic effect handler for Fiber.
 *
 * This module interprets component generators (algebraic effects),
 * handling each yielded EffectOp and building/updating the Fiber tree.
 *
 * The reconciler is the "effect handler" in the algebraic effects model:
 *   - `yield useState(0)` → handler allocates/reads state in fiber
 *   - `yield useEffect(...)` → handler schedules effect
 *   - `yield use(async)` → handler resolves or throws SuspendException
 *
 * Fiber reconciliation (beginWork / completeWork) traverses the tree,
 * diffing old vs new fibers and marking them with effect tags.
 */

import type { EffectOp, ComponentGen } from "./hooks.ts";
import {
	type Ref,
	type SetState,
	type Dispatch,
	type TransitionHandle,
	type Async,
	newRef,
	SuspendException,
} from "./hooks.ts";
import type { MElement } from "./element.ts";
import {
	type FiberNode,
	type EffectEntry,
	createHostFiber,
	createFunctionFiber,
	createTextFiber,
	createFragmentFiber,
	createSuspenseFiber,
	createServerFiber,
	resetHookCursor,
	readHook,
	writeHook,
	appendHook,
} from "./fiber.ts";

// ============================================================================
// Types
// ============================================================================

export interface ReconcileResult {
	fiber: FiberNode;
	pendingPromises: Promise<unknown>[];
}

// ============================================================================
// Effect handler — interprets a component generator against a fiber
// ============================================================================

export const handleEffects = (
	gen: ComponentGen,
	fiber: FiberNode,
): MElement => {
	resetHookCursor(fiber);
	let result = gen.next();

	while (!result.done) {
		const op = result.value;
		const resumeValue = handleOp(op, fiber);
		result = gen.next(resumeValue);
	}

	return result.value;
};

const handleOp = (op: EffectOp, fiber: FiberNode): unknown => {
	switch (op.tag) {
		case "useState":
			return handleUseState(op.initial, fiber);
		case "useReducer":
			return handleUseReducer(op.reducer, op.initial, fiber);
		case "useRef":
			return handleUseRef(op.initial, fiber);
		case "useEffect":
			return handleUseEffect("passive", op.deps, op.action, fiber);
		case "useLayoutEffect":
			return handleUseEffect("layout", op.deps, op.action, fiber);
		case "useMemo":
			return handleUseMemo(op.deps, op.compute, fiber);
		case "useCallback":
			return handleUseCallback(op.deps, op.f, fiber);
		case "useContext":
			return op.context.defaultValue;
		case "useId":
			return handleUseId(fiber);
		case "useTransition":
			return handleUseTransition(fiber);
		case "useDeferredValue":
			return handleUseDeferredValue(op.value, fiber);
		case "use":
			return handleUse(op.async, fiber);
		case "suspense":
			return handleSuspense(op.fallback, op.child, fiber);
	}
};

// ============================================================================
// Individual hook handlers
// ============================================================================

const handleUseState = (
	initial: unknown,
	fiber: FiberNode,
): [unknown, SetState<unknown>] => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		appendHook(fiber, initial);
		const setState: SetState<unknown> = (nextVal) => {
			writeHook(fiber, cursor, nextVal);
			fiber.scheduleUpdate?.();
		};
		return [initial, setState];
	}
	const val = readHook(fiber, cursor);
	const setState: SetState<unknown> = (nextVal) => {
		writeHook(fiber, cursor, nextVal);
		fiber.scheduleUpdate?.();
	};
	return [val, setState];
};

const handleUseReducer = (
	reducer: (state: unknown, action: unknown) => unknown,
	initial: unknown,
	fiber: FiberNode,
): [unknown, Dispatch<unknown>] => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		appendHook(fiber, initial);
		const dispatch: Dispatch<unknown> = (action) => {
			const old = readHook(fiber, cursor);
			const next = reducer(old, action);
			writeHook(fiber, cursor, next);
			fiber.scheduleUpdate?.();
		};
		return [initial, dispatch];
	}
	const val = readHook(fiber, cursor);
	const dispatch: Dispatch<unknown> = (action) => {
		const old = readHook(fiber, cursor);
		const next = reducer(old, action);
		writeHook(fiber, cursor, next);
		fiber.scheduleUpdate?.();
	};
	return [val, dispatch];
};

const handleUseRef = (initial: unknown, fiber: FiberNode): Ref<unknown> => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		const ref = newRef(initial);
		appendHook(fiber, ref);
		return ref;
	}
	return readHook(fiber, cursor) as Ref<unknown>;
};

const handleUseEffect = (
	phase: EffectEntry["phase"],
	hookDeps: import("./hooks.ts").DepsLike,
	action: () => () => void,
	fiber: FiberNode,
): void => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		const entry: EffectEntry = {
			phase,
			action,
			cleanup: () => {},
			prevDeps: undefined,
		};
		appendHook(fiber, entry);
		fiber.pendingEffects.push(entry);
		return;
	}
	const entry = readHook(fiber, cursor) as EffectEntry;
	const shouldRun = checkDeps(hookDeps, entry.prevDeps);
	if (shouldRun) {
		const updated = { ...entry, action };
		fiber.pendingEffects.push(updated);
	}
	updatePrevDeps(entry, hookDeps);
};

const handleUseMemo = (
	hookDeps: import("./hooks.ts").DepsLike,
	compute: () => unknown,
	fiber: FiberNode,
): unknown => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		const val = compute();
		appendHook(fiber, { value: val, deps: hookDeps ? [...hookDeps] : undefined });
		return val;
	}
	const stored = readHook(fiber, cursor) as { value: unknown; deps: unknown[] | undefined };
	if (checkDeps(hookDeps, stored.deps)) {
		const val = compute();
		writeHook(fiber, cursor, { value: val, deps: hookDeps ? [...hookDeps] : undefined });
		return val;
	}
	return stored.value;
};

const handleUseCallback = (
	hookDeps: import("./hooks.ts").DepsLike,
	f: unknown,
	fiber: FiberNode,
): unknown => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		appendHook(fiber, { f, deps: hookDeps ? [...hookDeps] : undefined });
		return f;
	}
	const stored = readHook(fiber, cursor) as { f: unknown; deps: unknown[] | undefined };
	if (checkDeps(hookDeps, stored.deps)) {
		writeHook(fiber, cursor, { f, deps: hookDeps ? [...hookDeps] : undefined });
		return f;
	}
	return stored.f;
};

const handleUseId = (fiber: FiberNode): string => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		const idStr = `:r${fiber.idCounter++}:`;
		appendHook(fiber, idStr);
		return idStr;
	}
	return readHook(fiber, cursor) as string;
};

const handleUseTransition = (fiber: FiberNode): TransitionHandle => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		const handle: TransitionHandle = {
			isPending: false,
			startTransition: (action) => {
				handle.isPending = true;
				action();
				handle.isPending = false;
				fiber.scheduleUpdate?.();
			},
		};
		appendHook(fiber, handle);
		return handle;
	}
	return readHook(fiber, cursor) as TransitionHandle;
};

const handleUseDeferredValue = (
	value: unknown,
	fiber: FiberNode,
): unknown => {
	const cursor = fiber.hookCursor++;
	if (fiber.isFirstRender) {
		appendHook(fiber, { value, isDeferred: false });
		return value;
	}
	const stored = readHook(fiber, cursor) as {
		value: unknown;
		isDeferred: boolean;
	};
	if (stored.isDeferred) {
		stored.isDeferred = false;
		stored.value = value;
		writeHook(fiber, cursor, stored);
		return value;
	}
	stored.isDeferred = true;
	fiber.scheduleUpdate?.();
	return stored.value;
};

const handleUse = (async: Async<unknown>, fiber: FiberNode): unknown => {
	switch (async.status.tag) {
		case "resolved":
			return async.status.value;
		case "rejected":
			throw async.status.error;
		case "pending": {
			const promise = async.promise ?? Promise.resolve();
			async.onResolve.push(() => fiber.scheduleUpdate?.());
			throw new SuspendException(promise);
		}
	}
};

const handleSuspense = (
	fallback: MElement,
	child: ComponentGen,
	fiber: FiberNode,
): MElement => {
	try {
		return handleEffects(child, fiber);
	} catch (e) {
		if (e instanceof SuspendException) {
			fiber.pendingPromises.push(e.promise);
			return fallback;
		}
		throw e;
	}
};

// ============================================================================
// Fiber reconciliation — build/update fiber tree from MElements
// ============================================================================

/** Reconcile an MElement into a FiberNode (or reuse existing). */
export const reconcileElement = (
	element: MElement,
	oldFiber: FiberNode | null,
	parentFiber: FiberNode,
): FiberNode | null => {
	if (element === null) return null;

	switch (element.kind) {
		case "host":
			return reconcileHost(element, oldFiber, parentFiber);
		case "component":
			return reconcileComponent(element, oldFiber, parentFiber);
		case "text":
			return reconcileText(element, oldFiber, parentFiber);
		case "fragment":
			return reconcileFragment(element, oldFiber, parentFiber);
		case "suspense":
			return reconcileSuspense(element, oldFiber, parentFiber);
		case "server":
			return reconcileServer(element, oldFiber, parentFiber);
	}
};

const reconcileHost = (
	element: Extract<MElement, { kind: "host" }>,
	oldFiber: FiberNode | null,
	parentFiber: FiberNode,
): FiberNode => {
	if (oldFiber && oldFiber.tag === "host" && oldFiber.type === element.type) {
		oldFiber.props = element.props;
		oldFiber.effectTag = "update";
		reconcileChildren(element.children, oldFiber);
		return oldFiber;
	}
	const fiber = createHostFiber(element.type, element.props, element.children);
	fiber.effectTag = "placement";
	fiber.return = parentFiber;
	fiber.scheduleUpdate = parentFiber.scheduleUpdate;
	reconcileChildren(element.children, fiber);
	return fiber;
};

const reconcileComponent = (
	element: Extract<MElement, { kind: "component" }>,
	oldFiber: FiberNode | null,
	parentFiber: FiberNode,
): FiberNode => {
	let fiber: FiberNode;

	if (
		oldFiber &&
		oldFiber.tag === "function" &&
		oldFiber.component === element.type
	) {
		fiber = oldFiber;
		fiber.props = element.props;
		fiber.isFirstRender = false;
		fiber.effectTag = "update";
		fiber.pendingEffects = [];
	} else {
		fiber = createFunctionFiber(element.type, element.props);
		fiber.effectTag = "placement";
		fiber.return = parentFiber;
		fiber.scheduleUpdate = parentFiber.scheduleUpdate;
	}

	// Run the component generator (algebraic effect handling)
	const gen = fiber.component!(fiber.props);
	const childElement = handleEffects(gen, fiber);

	// Reconcile the produced element into child fibers
	if (childElement !== null) {
		const childFiber = reconcileElement(
			childElement,
			fiber.child,
			fiber,
		);
		fiber.child = childFiber;
	} else {
		fiber.child = null;
	}

	return fiber;
};

const reconcileText = (
	element: Extract<MElement, { kind: "text" }>,
	oldFiber: FiberNode | null,
	parentFiber: FiberNode,
): FiberNode => {
	if (oldFiber && oldFiber.tag === "text") {
		if (oldFiber.props.content !== element.content) {
			oldFiber.props = { content: element.content };
			oldFiber.effectTag = "update";
		}
		return oldFiber;
	}
	const fiber = createTextFiber(element.content);
	fiber.effectTag = "placement";
	fiber.return = parentFiber;
	fiber.scheduleUpdate = parentFiber.scheduleUpdate;
	return fiber;
};

const reconcileFragment = (
	element: Extract<MElement, { kind: "fragment" }>,
	oldFiber: FiberNode | null,
	parentFiber: FiberNode,
): FiberNode => {
	const fiber =
		oldFiber && oldFiber.tag === "fragment"
			? oldFiber
			: createFragmentFiber(element.children);
	fiber.props = { children: element.children };
	fiber.effectTag = oldFiber ? "update" : "placement";
	fiber.return = parentFiber;
	fiber.scheduleUpdate = parentFiber.scheduleUpdate;
	reconcileChildren(element.children, fiber);
	return fiber;
};

const reconcileSuspense = (
	element: Extract<MElement, { kind: "suspense" }>,
	oldFiber: FiberNode | null,
	parentFiber: FiberNode,
): FiberNode => {
	const fiber =
		oldFiber && oldFiber.tag === "suspense"
			? oldFiber
			: createSuspenseFiber(element.fallback, element.children);

	fiber.suspenseFallback = element.fallback;
	fiber.props = { children: element.children };
	fiber.effectTag = oldFiber ? "update" : "placement";
	fiber.return = parentFiber;
	fiber.scheduleUpdate = parentFiber.scheduleUpdate;
	fiber.isSuspended = false;
	fiber.pendingPromises = [];

	try {
		reconcileChildren(element.children, fiber);
	} catch (e) {
		if (e instanceof SuspendException) {
			fiber.isSuspended = true;
			fiber.pendingPromises.push(e.promise);
			// Render fallback instead
			if (element.fallback !== null) {
				const fallbackFiber = reconcileElement(
					element.fallback,
					null,
					fiber,
				);
				fiber.child = fallbackFiber;
			}
		} else {
			throw e;
		}
	}

	return fiber;
};

const reconcileServer = (
	element: Extract<MElement, { kind: "server" }>,
	oldFiber: FiberNode | null,
	parentFiber: FiberNode,
): FiberNode => {
	let fiber: FiberNode;

	if (
		oldFiber &&
		oldFiber.tag === "server" &&
		oldFiber.serverComponent === element.type
	) {
		fiber = oldFiber;
		fiber.props = element.props;
		fiber.effectTag = "update";
	} else {
		fiber = createServerFiber(element.type, element.props);
		fiber.effectTag = "placement";
		fiber.return = parentFiber;
		fiber.scheduleUpdate = parentFiber.scheduleUpdate;
	}

	// Server component result is set by the server runtime
	if (fiber.serverResult !== null) {
		const childFiber = reconcileElement(
			fiber.serverResult,
			fiber.child,
			fiber,
		);
		fiber.child = childFiber;
	}

	return fiber;
};

// ============================================================================
// Children reconciliation (keyed + positional)
// ============================================================================

const reconcileChildren = (
	children: MElement[],
	parentFiber: FiberNode,
): void => {
	let oldChild = parentFiber.child;
	let prevSibling: FiberNode | null = null;
	parentFiber.deletions = [];

	for (let i = 0; i < children.length; i++) {
		const element = children[i];
		const currentOld = oldChild;
		const newFiber = reconcileElement(element, oldChild, parentFiber);

		// If old fiber was not reused, schedule it for deletion
		if (currentOld && newFiber !== currentOld) {
			currentOld.effectTag = "deletion";
			parentFiber.deletions.push(currentOld);
		}

		if (newFiber) {
			newFiber.return = parentFiber;
			if (i === 0) {
				parentFiber.child = newFiber;
			} else if (prevSibling) {
				prevSibling.sibling = newFiber;
			}
			prevSibling = newFiber;
		}

		if (currentOld) {
			oldChild = currentOld.sibling;
		}
	}

	// Mark remaining old children for deletion
	while (oldChild) {
		oldChild.effectTag = "deletion";
		parentFiber.deletions.push(oldChild);
		oldChild = oldChild.sibling;
	}
};

// ============================================================================
// Deps checking
// ============================================================================

/** Check if effect should re-run based on deps list.
 *  undefined → always run, [] → mount only, [...] → shallow compare */
const checkDeps = (
	hookDeps: import("./hooks.ts").DepsLike,
	prevDeps: unknown,
): boolean => {
	// undefined (no deps array) → always run
	if (hookDeps === undefined) return true;
	// first run
	if (prevDeps === undefined) return true;
	// [] → mount only (prevDeps exists, so skip)
	if (hookDeps.length === 0) return false;
	// compare deps arrays
	return !shallowEqual(hookDeps, prevDeps);
};

const updatePrevDeps = (
	entry: EffectEntry,
	hookDeps: import("./hooks.ts").DepsLike,
): void => {
	entry.prevDeps = hookDeps === undefined ? undefined : [...hookDeps];
};

const shallowEqual = (a: unknown, b: unknown): boolean => {
	if (Object.is(a, b)) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => Object.is(v, b[i]));
	}
	return false;
};
