/**
 * Component types — a Component is a generator function (Kleisli arrow).
 *
 *   Component: Props -> Generator<EffectOp, MElement, unknown>
 *
 * The generator yields effect operations (algebraic effects).
 * The reconciler handles each yield and resumes the generator.
 */

import type { EffectOp, MElement, Props } from "@mreact/core";
import type { Slot } from "@mreact/core";

// ============================================================================
// Component type aliases
// ============================================================================

/** Function Component — a generator function that yields effects and returns MElement. */
export type FC<P extends Props = Props> = (
	props: P,
) => Generator<EffectOp, MElement, unknown>;

/** Stateless Function Component — produces MElement without hooks. */
export type StatelessFC<P extends Props = Props> = (props: P) => MElement;

/** Server Component — async function, no client-side hooks. */
export type ServerFC<P extends Props = Props> = (
	props: P,
) => Promise<MElement> | MElement;

// ============================================================================
// Typed FC with phantom slot tracking
//
// For documentation: FC_<Slots, Props> annotates which hooks are used.
// TypeScript cannot enforce this, but it documents the contract.
// ============================================================================

export type FC_<_J extends readonly Slot[], P extends Props = Props> = (
	props: P,
) => Generator<EffectOp, MElement, unknown>;
