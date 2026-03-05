/**
 * useTransition example — demonstrates non-urgent state updates.
 *
 * useTransition returns a handle with:
 *   - isPending: boolean — whether a transition is in progress
 *   - startTransition: (action) => void — wrap an update to mark it non-urgent
 *
 * Non-urgent updates can be interrupted by urgent ones (e.g., user input),
 * keeping the UI responsive during expensive state transitions.
 */

import { useState, useTransition, h, text } from "@mreact/core";
import type { FC } from "@mreact/dom";

export const UseTransitionApp: FC = function* () {
	const [tab, setTab] = yield* useState("home");
	const transition = yield* useTransition();

	const tabContent = transition.isPending
		? <p class="loading">{text("Transitioning...")}</p>
		: <p>{text(`Current tab: ${tab}`)}</p>;

	return (
		<div class="use-transition-demo">
			<h1>{text("useTransition Demo")}</h1>
			<nav>
				<button onClick={(_: unknown) => transition.startTransition(() => setTab("home"))}>Home</button>
				<button onClick={(_: unknown) => transition.startTransition(() => setTab("about"))}>About</button>
				<button onClick={(_: unknown) => transition.startTransition(() => setTab("contact"))}>Contact</button>
			</nav>
			{tabContent}
		</div>
	);
};
