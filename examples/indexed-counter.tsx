/**
 * Indexed Counter — Rules of Hooks enforced at the type level.
 *
 * Uses the Ix<I, J, A> indexed monad instead of raw generators.
 * Each hook prepends a Slot to the type-level state list:
 *
 *   ixUseState(0)    : Ix<I, [SState<number>, ...I], [number, SetState<number>]>
 *   ixUseEffect(...) : Ix<I, [SEffect, ...I], void>
 *
 * Conditional hooks are a TYPE ERROR because the branches
 * would produce different slot lists (J doesn't unify).
 *
 * Haskell equivalent:
 *   counter :: FC '[SEffect, SState Int] ()
 *   counter () = do
 *     (count, setCount) <- useState 0
 *     useEffect (deps count) $ putStrLn ("Count: " ++ show count)
 *     return $ div [] [ ... ]
 */

import type { SState, SEffect } from "@mreact/core";
import type { IxFC } from "@mreact/core";
import { ixUseState, ixUseEffect, ixComponent } from "@mreact/core";
import { div, h1, p_, button, text, class_, onClick } from "@mreact/dom";

// ============================================================================
// Type-safe component: hook signature is declared and ENFORCED
// ============================================================================

// The slot list [SEffect, SState<number>] is built right-to-left:
//   1. ixUseState(0)    → adds SState<number>
//   2. ixUseEffect(...) → adds SEffect
// Final: [SEffect, SState<number>]

const counter: IxFC<[SEffect, SState<number>]> = (_props) =>
	ixUseState(0)
		.bind(([count, setCount]) =>
			ixUseEffect(() => {
				console.log(`Count changed: ${count}`);
			}, [count])
				.map(() =>
					div(
						class_("counter"),
						h1({}, text("Indexed Counter")),
						p_({}, text(`Count: ${count}`)),
						p_({}, text(`Double: ${count * 2}`)),
						button(onClick((_) => setCount(count + 1)), text("+")),
						button(onClick((_) => setCount(count - 1)), text("-")),
						button(onClick((_) => setCount(0)), text("Reset")),
					),
				),
		);

// Convert to a regular component for the reconciler
export const IndexedCounter = ixComponent(counter);

// ============================================================================
// TYPE ERROR examples (uncomment to see):
// ============================================================================

// 1. Conditional hook — produces different slot lists in branches:
//
// const bad: IxFC<[SState<number>]> = (_props) =>
//   ixUseState(0)
//     .bind(([count, _]) =>
//       count > 0
//         ? ixUseState(true).map(...)  // Ix<[SState<number>], [SState<boolean>, SState<number>], ...>
//         : ixPure(div({}))            // Ix<[SState<number>], [SState<number>], ...>
//     );  // ← TYPE ERROR: J doesn't unify between branches

// 2. Wrong slot signature — declared type doesn't match actual hooks:
//
// const wrong: IxFC<[SState<number>]> = (_props) =>
//   ixUseState(0)
//     .bind(([count, _]) =>
//       ixUseEffect(() => {}, [count])  // adds SEffect
//         .map(() => div({}))
//     );  // ← TYPE ERROR: result is [SEffect, SState<number>], not [SState<number>]
