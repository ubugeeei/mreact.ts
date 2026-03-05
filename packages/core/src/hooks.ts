/**
 * Hooks — Algebraic Effects via Generators.
 *
 * Components are generators that `yield` hook operations.
 * The reconciler is the effect handler that interprets each yielded op,
 * resuming the generator with the appropriate value.
 *
 * yield = "perform" (algebraic effects)
 * handler = reconciler/interpreter
 * continuation = the rest of the generator after yield
 *
 * Type-level slot tracking via phantom types (Atkey-style indexed monad)
 * ensures Rules of Hooks are documented in types, even though TypeScript
 * cannot enforce them at the type level like Haskell's GADT approach.
 */

// ============================================================================
// Slot kinds — phantom types for indexed monad documentation
// ============================================================================

declare const SStateBrand: unique symbol;
declare const SReducerBrand: unique symbol;
declare const SRefBrand: unique symbol;
declare const SMemoBrand: unique symbol;
declare const SCallbackBrand: unique symbol;
declare const SEffectBrand: unique symbol;
declare const SLayoutEffectBrand: unique symbol;
declare const SContextBrand: unique symbol;
declare const SIdBrand: unique symbol;
declare const STransitionBrand: unique symbol;
declare const SDeferredValueBrand: unique symbol;

export type SState<S> = { readonly [SStateBrand]: never; readonly _s: S };
export type SReducer<S> = { readonly [SReducerBrand]: never; readonly _s: S };
export type SRef<A> = { readonly [SRefBrand]: never; readonly _a: A };
export type SMemo<A> = { readonly [SMemoBrand]: never; readonly _a: A };
export type SCallback<F> = { readonly [SCallbackBrand]: never; readonly _f: F };
export type SEffect = { readonly [SEffectBrand]: never };
export type SLayoutEffect = { readonly [SLayoutEffectBrand]: never };
export type SContext<A> = { readonly [SContextBrand]: never; readonly _a: A };
export type SId = { readonly [SIdBrand]: never };
export type STransition = { readonly [STransitionBrand]: never };
export type SDeferredValue<A> = { readonly [SDeferredValueBrand]: never; readonly _a: A };

export type Slot =
	| SState<unknown>
	| SReducer<unknown>
	| SRef<unknown>
	| SMemo<unknown>
	| SCallback<unknown>
	| SEffect
	| SLayoutEffect
	| SContext<unknown>
	| SId
	| STransition
	| SDeferredValue<unknown>;

export type Cons<H extends Slot, T extends readonly Slot[]> = [H, ...T];

// ============================================================================
// Deps — dependency tracking (React-style list)
//
// undefined  → no dependency array — run every render
// []         → empty array — run only on mount
// [a, b, c]  → dependency list — run when any value changes
// ============================================================================

export type DepsLike = unknown[] | undefined;

// ============================================================================
// Ref
// ============================================================================

export interface Ref<A> {
	current: A;
}

export function newRef<A>(initial: A): Ref<A> {
	return { current: initial };
}

// ============================================================================
// SetState / Dispatch
// ============================================================================

export type SetState<S> = (nextState: S) => void;
export type Dispatch<Action> = (action: Action) => void;

// ============================================================================
// TransitionHandle
// ============================================================================

export interface TransitionHandle {
	isPending: boolean;
	readonly startTransition: (action: () => void) => void;
}

// ============================================================================
// Context
// ============================================================================

export interface Context<A> {
	readonly defaultValue: A;
	readonly id: number;
}

let contextIdCounter = 0;
export function createContext<A>(defaultValue: A): Context<A> {
	return { defaultValue, id: contextIdCounter++ };
}

// ============================================================================
// Async / Suspense
// ============================================================================

export type AsyncStatus<A> =
	| { readonly tag: "pending" }
	| { readonly tag: "resolved"; readonly value: A }
	| { readonly tag: "rejected"; readonly error: unknown };

export interface Async<A> {
	status: AsyncStatus<A>;
	onResolve: Array<() => void>;
	promise: Promise<A> | null;
}

export function createAsync<A>(action: () => Promise<A>): Async<A> {
	const p = action();
	const a: Async<A> = { status: { tag: "pending" }, onResolve: [], promise: p };
	p.then(
		(value) => {
			a.status = { tag: "resolved", value };
			for (const cb of a.onResolve) cb();
		},
		(error: unknown) => {
			a.status = { tag: "rejected", error };
			for (const cb of a.onResolve) cb();
		},
	);
	return a;
}

export function resolve<A>(value: A): Async<A> {
	return {
		status: { tag: "resolved", value },
		onResolve: [],
		promise: Promise.resolve(value),
	};
}

export class SuspendException extends Error {
	promise: Promise<unknown>;
	constructor(promise: Promise<unknown>) {
		super("SuspendException");
		this.name = "SuspendException";
		this.promise = promise;
	}
}

// ============================================================================
// EffectOp — Algebraic effect operations
//
// These are what generators yield. Each op is an "effect request"
// that the handler (reconciler) intercepts and resumes with a value.
//
// yield = perform (in algebraic effects terminology)
// handler resume = gen.next(value)
// ============================================================================

import type { MElement } from "./element.ts";

export type EffectOp =
	| { readonly tag: "useState"; readonly initial: unknown }
	| {
			readonly tag: "useReducer";
			readonly reducer: (state: unknown, action: unknown) => unknown;
			readonly initial: unknown;
	  }
	| { readonly tag: "useRef"; readonly initial: unknown }
	| {
			readonly tag: "useEffect";
			readonly deps: DepsLike;
			readonly action: () => () => void;
	  }
	| {
			readonly tag: "useLayoutEffect";
			readonly deps: DepsLike;
			readonly action: () => () => void;
	  }
	| {
			readonly tag: "useMemo";
			readonly deps: DepsLike;
			readonly compute: () => unknown;
	  }
	| {
			readonly tag: "useCallback";
			readonly deps: DepsLike;
			readonly f: unknown;
	  }
	| { readonly tag: "useContext"; readonly context: Context<unknown> }
	| { readonly tag: "useId" }
	| { readonly tag: "useTransition" }
	| { readonly tag: "useDeferredValue"; readonly value: unknown }
	| { readonly tag: "use"; readonly async: Async<unknown> }
	| {
			readonly tag: "suspense";
			readonly fallback: MElement;
			readonly child: ComponentGen;
	  };

/** Generator type for components — yields EffectOps, returns MElement. */
export type ComponentGen = Generator<EffectOp, MElement, unknown>;

// ============================================================================
// Hook generators — each yields one EffectOp
//
// Components use `yield*` to delegate to these, making the algebraic
// effect structure explicit while keeping component code clean.
// Deps are post-positioned as arrays, matching React's API:
//
//   function* Counter() {
//     const [count, setCount] = yield* useState(0);
//     yield* useEffect(() => console.log(count), [count]);
//     return div({}, text(`Count: ${count}`));
//   }
// ============================================================================

export function* useState<S>(
	initial: S,
): Generator<EffectOp, [S, SetState<S>], unknown> {
	return (yield { tag: "useState", initial }) as [S, SetState<S>];
}

export function* useReducer<S, Action>(
	reducer: (state: S, action: Action) => S,
	initial: S,
): Generator<EffectOp, [S, Dispatch<Action>], unknown> {
	return (yield {
		tag: "useReducer",
		reducer: reducer as (state: unknown, action: unknown) => unknown,
		initial,
	}) as [S, Dispatch<Action>];
}

export function* useRef<A>(
	initial: A,
): Generator<EffectOp, Ref<A>, unknown> {
	return (yield { tag: "useRef", initial }) as Ref<A>;
}

/** `useEffect(effect, deps?)` — deps is post-positioned list. */
export function* useEffect(
	effect: () => void,
	deps?: unknown[],
): Generator<EffectOp, void, unknown> {
	yield {
		tag: "useEffect",
		deps,
		action: () => {
			effect();
			return () => {};
		},
	};
}

/** `useEffectWithCleanup(effect, deps?)` — effect returns cleanup fn. */
export function* useEffectWithCleanup(
	effect: () => () => void,
	deps?: unknown[],
): Generator<EffectOp, void, unknown> {
	yield { tag: "useEffect", deps, action: effect };
}

/** `useLayoutEffect(effect, deps?)` — synchronous, before paint. */
export function* useLayoutEffect(
	effect: () => void,
	deps?: unknown[],
): Generator<EffectOp, void, unknown> {
	yield {
		tag: "useLayoutEffect",
		deps,
		action: () => {
			effect();
			return () => {};
		},
	};
}

/** `useLayoutEffectWithCleanup(effect, deps?)` */
export function* useLayoutEffectWithCleanup(
	effect: () => () => void,
	deps?: unknown[],
): Generator<EffectOp, void, unknown> {
	yield { tag: "useLayoutEffect", deps, action: effect };
}

/** `useMemo(compute, deps?)` — deps is post-positioned list. */
export function* useMemo<A>(
	compute: () => A,
	deps?: unknown[],
): Generator<EffectOp, A, unknown> {
	return (yield { tag: "useMemo", deps, compute }) as A;
}

/** `useCallback(f, deps?)` — deps is post-positioned list. */
export function* useCallback<F>(
	f: F,
	deps?: unknown[],
): Generator<EffectOp, F, unknown> {
	return (yield { tag: "useCallback", deps, f }) as F;
}

export function* useContext<A>(
	ctx: Context<A>,
): Generator<EffectOp, A, unknown> {
	return (yield { tag: "useContext", context: ctx as Context<unknown> }) as A;
}

export function* useId(): Generator<EffectOp, string, unknown> {
	return (yield { tag: "useId" }) as string;
}

export function* useTransition(): Generator<
	EffectOp,
	TransitionHandle,
	unknown
> {
	return (yield { tag: "useTransition" }) as TransitionHandle;
}

export function* useDeferredValue<A>(
	value: A,
): Generator<EffectOp, A, unknown> {
	return (yield { tag: "useDeferredValue", value }) as A;
}

/** `use`: unwrap Async. Identity index — safe inside control flow. */
export function* use<A>(
	async: Async<A>,
): Generator<EffectOp, A, unknown> {
	return (yield { tag: "use", async: async as Async<unknown> }) as A;
}
