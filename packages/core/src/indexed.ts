/**
 * Indexed Monad — type-level Rules of Hooks enforcement.
 *
 * Haskell mreact uses:
 *   Hooks :: [Slot] -> [Slot] -> * -> *
 *   HState :: s -> Hooks i (SState s ': i) (s, SetState s)
 *   HUse   :: Async a -> Hooks i i a   -- identity index, safe in control flow
 *
 * TypeScript can't express indexed monads natively, but we can approximate
 * it using branded phantom types and a chaining API:
 *
 *   Ix<I, J, A>  — computation from hook-state I to hook-state J, producing A
 *   ixBind       — chains: Ix<I,J,A> → (A → Ix<J,K,B>) → Ix<I,K,B>
 *
 * This makes conditional hook usage a TYPE ERROR:
 *
 *   // OK: both branches produce same slot list
 *   ixUseState(0).then(([count, _]) =>
 *     count > 0 ? ixPure(div({})) : ixPure(div({}))  // Ix<[SState<number>], [SState<number>], MElement>
 *   )
 *
 *   // TYPE ERROR: branches produce different slot lists
 *   ixUseState(0).then(([count, _]) =>
 *     count > 0
 *       ? ixUseState(true).map(...)   // Ix<[SState<number>], [SState<boolean>, SState<number>], ...>
 *       : ixPure(div({}))             // Ix<[SState<number>], [SState<number>], ...>
 *   )   // ← TYPE ERROR: J doesn't unify
 */

import type {
	Slot,
	SState,
	SReducer,
	SRef,
	SMemo,
	SCallback,
	SEffect,
	SLayoutEffect,
	SContext,
	SId,
	STransition,
	SDeferredValue,
	SetState,
	Dispatch,
	Ref,
	TransitionHandle,
	Context,
	Async,
	EffectOp,
	ComponentGen,
} from "./hooks.ts";
import type { MElement } from "./element.ts";

// ============================================================================
// Ix<I, J, A> — the indexed computation type
//
//   I = hook-state before (type-level slot list)
//   J = hook-state after
//   A = result value
// ============================================================================

declare const IxPreBrand: unique symbol;
declare const IxPostBrand: unique symbol;

export interface Ix<I extends readonly Slot[], J extends readonly Slot[], A> {
	readonly [IxPreBrand]: I;
	readonly [IxPostBrand]: J;

	/** Run the computation as a generator (for the reconciler). */
	readonly gen: () => ComponentGen;

	/** The result value (only available after running). */
	readonly _result: A;

	/** Bind: chain computations, composing state transitions (ibind). */
	bind<K extends readonly Slot[], B>(
		f: (a: A) => Ix<J, K, B>,
	): Ix<I, K, B>;

	/** Map: transform the result while preserving state indices. */
	map<B>(f: (a: A) => B): Ix<I, J, B>;
}

// ============================================================================
// Ix constructors (internal)
// ============================================================================

const mkIx = <I extends readonly Slot[], J extends readonly Slot[], A>(
	genFn: () => Generator<EffectOp, A, unknown>,
): Ix<I, J, A> => {
	const ix: Ix<I, J, A> = {
		gen: genFn as () => ComponentGen,
		_result: undefined as unknown as A,

		bind<K extends readonly Slot[], B>(
			f: (a: A) => Ix<J, K, B>,
		): Ix<I, K, B> {
			return mkIx<I, K, B>(function* () {
				const a: A = yield* genFn() as Generator<EffectOp, A, unknown>;
				const nextIx = f(a);
				return yield* nextIx.gen() as Generator<EffectOp, B, unknown>;
			});
		},

		map<B>(f: (a: A) => B): Ix<I, J, B> {
			return mkIx<I, J, B>(function* () {
				const a: A = yield* genFn() as Generator<EffectOp, A, unknown>;
				return f(a);
			});
		},
	} as Ix<I, J, A>;
	return ix;
};

// ============================================================================
// ixPure — identity on state index (no hook slot consumed)
// ============================================================================

export const ixPure = <I extends readonly Slot[], A>(a: A): Ix<I, I, A> => {
	// Pure value — no effects, identity on state index.
	// Uses a trivial generator that immediately returns.
	const gen = function* () { return a; }; // eslint-disable-line require-yield
	return mkIx<I, I, A>(gen);
};

// ============================================================================
// ixRender — wrap the final MElement to produce a ComponentGen
// ============================================================================

export const ixRender = <I extends readonly Slot[]>(
	ix: Ix<[], I, MElement>,
): ComponentGen => ix.gen() as ComponentGen;

// ============================================================================
// Indexed hook primitives — each prepends a Slot to the state list
// ============================================================================

/** useState: `Ix<I, [SState<S>, ...I], [S, SetState<S>]>` */
export const ixUseState = <S, I extends readonly Slot[] = readonly Slot[]>(
	initial: S,
): Ix<I, [SState<S>, ...I], [S, SetState<S>]> =>
	mkIx(function* () {
		return (yield { tag: "useState", initial }) as [S, SetState<S>];
	});

/** useReducer: `Ix<I, [SReducer<S>, ...I], [S, Dispatch<A>]>` */
export const ixUseReducer = <S, A, I extends readonly Slot[] = readonly Slot[]>(
	reducer: (state: S, action: A) => S,
	initial: S,
): Ix<I, [SReducer<S>, ...I], [S, Dispatch<A>]> =>
	mkIx(function* () {
		return (yield {
			tag: "useReducer",
			reducer: reducer as (s: unknown, a: unknown) => unknown,
			initial,
		}) as [S, Dispatch<A>];
	});

/** useRef: `Ix<I, [SRef<A>, ...I], Ref<A>>` */
export const ixUseRef = <A, I extends readonly Slot[] = readonly Slot[]>(
	initial: A,
): Ix<I, [SRef<A>, ...I], Ref<A>> =>
	mkIx(function* () {
		return (yield { tag: "useRef", initial }) as Ref<A>;
	});

/** useEffect: `Ix<I, [SEffect, ...I], void>` */
export const ixUseEffect = <I extends readonly Slot[] = readonly Slot[]>(
	effect: () => void,
	deps?: unknown[],
): Ix<I, [SEffect, ...I], void> =>
	mkIx(function* () {
		yield {
			tag: "useEffect",
			deps,
			action: () => { effect(); return () => {}; },
		};
	});

/** useLayoutEffect: `Ix<I, [SLayoutEffect, ...I], void>` */
export const ixUseLayoutEffect = <I extends readonly Slot[] = readonly Slot[]>(
	effect: () => void,
	deps?: unknown[],
): Ix<I, [SLayoutEffect, ...I], void> =>
	mkIx(function* () {
		yield {
			tag: "useLayoutEffect",
			deps,
			action: () => { effect(); return () => {}; },
		};
	});

/** useMemo: `Ix<I, [SMemo<A>, ...I], A>` */
export const ixUseMemo = <A, I extends readonly Slot[] = readonly Slot[]>(
	compute: () => A,
	deps?: unknown[],
): Ix<I, [SMemo<A>, ...I], A> =>
	mkIx(function* () {
		return (yield { tag: "useMemo", deps, compute }) as A;
	});

/** useCallback: `Ix<I, [SCallback<F>, ...I], F>` */
export const ixUseCallback = <F, I extends readonly Slot[] = readonly Slot[]>(
	f: F,
	deps?: unknown[],
): Ix<I, [SCallback<F>, ...I], F> =>
	mkIx(function* () {
		return (yield { tag: "useCallback", deps, f }) as F;
	});

/** useContext: `Ix<I, [SContext<A>, ...I], A>` */
export const ixUseContext = <A, I extends readonly Slot[] = readonly Slot[]>(
	ctx: Context<A>,
): Ix<I, [SContext<A>, ...I], A> =>
	mkIx(function* () {
		return (yield { tag: "useContext", context: ctx as Context<unknown> }) as A;
	});

/** useId: `Ix<I, [SId, ...I], string>` */
export const ixUseId = <I extends readonly Slot[] = readonly Slot[]>(): Ix<
	I,
	[SId, ...I],
	string
> =>
	mkIx(function* () {
		return (yield { tag: "useId" }) as string;
	});

/** useTransition: `Ix<I, [STransition, ...I], TransitionHandle>` */
export const ixUseTransition = <I extends readonly Slot[] = readonly Slot[]>(): Ix<
	I,
	[STransition, ...I],
	TransitionHandle
> =>
	mkIx(function* () {
		return (yield { tag: "useTransition" }) as TransitionHandle;
	});

/** useDeferredValue: `Ix<I, [SDeferredValue<A>, ...I], A>` */
export const ixUseDeferredValue = <A, I extends readonly Slot[] = readonly Slot[]>(
	value: A,
): Ix<I, [SDeferredValue<A>, ...I], A> =>
	mkIx(function* () {
		return (yield { tag: "useDeferredValue", value }) as A;
	});

// ============================================================================
// Identity-index operations (safe inside control flow)
// ============================================================================

/** use: `Ix<I, I, A>` — identity index, safe in conditionals */
export const ixUse = <A, I extends readonly Slot[] = readonly Slot[]>(
	async: Async<A>,
): Ix<I, I, A> =>
	mkIx(function* () {
		return (yield { tag: "use", async: async as Async<unknown> }) as A;
	});

// ============================================================================
// IxFC — component type with enforced hook signature
//
//   IxFC<Slots, Props>
//
// The Slots type parameter declares EXACTLY which hooks the component uses.
// This is checked at the type level via the Ix chain.
// ============================================================================

export type IxFC<
	J extends readonly Slot[],
	P extends Record<string, unknown> = Record<string, unknown>,
> = (props: P) => Ix<[], J, MElement>;

/** Convert an IxFC to a regular ComponentGen-producing function. */
export const ixComponent = <
	J extends readonly Slot[],
	P extends Record<string, unknown> = Record<string, unknown>,
>(
	fc: IxFC<J, P>,
): ((props: P) => ComponentGen) => {
	return (props: P) => ixRender(fc(props));
};
