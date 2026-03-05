import { useState, useTransition, h, text, type EffectOp, type MElement } from "@mreact/core";

export const UseTransitionDemo = function* (): Generator<EffectOp, MElement, unknown> {
	const [tab, setTab] = yield* useState("home");
	const transition = yield* useTransition();

	const tabContent = transition.isPending
		? h("p", { class: "loading" }, text("Transitioning..."))
		: h("p", {}, text(`Current tab: ${tab}`));

	return (
		<div class="use-transition-demo">
			<h2>useTransition Demo</h2>
			<nav>
				<button onClick={(_: unknown) => transition.startTransition(() => setTab("home"))}>Home</button>
				<button onClick={(_: unknown) => transition.startTransition(() => setTab("about"))}>About</button>
				<button onClick={(_: unknown) => transition.startTransition(() => setTab("contact"))}>Contact</button>
			</nav>
			{tabContent}
		</div>
	);
};
