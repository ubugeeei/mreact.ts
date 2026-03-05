import { useState, h, text, type EffectOp, type MElement, type ComponentFn } from "@mreact/core";

import { CounterDemo } from "./demos/counter.tsx";
import { UseRefDemo } from "./demos/use-ref.tsx";
import { UseMemoDemo } from "./demos/use-memo.tsx";
import { UseIdDemo } from "./demos/use-id.tsx";
import { UseContextDemo } from "./demos/use-context.tsx";
import { UseTransitionDemo } from "./demos/use-transition.tsx";

type Tab = "counter" | "useRef" | "useMemo" | "useId" | "useContext" | "useTransition";

const tabs: { key: Tab; label: string }[] = [
	{ key: "counter", label: "Counter" },
	{ key: "useRef", label: "useRef" },
	{ key: "useMemo", label: "useMemo" },
	{ key: "useId", label: "useId" },
	{ key: "useContext", label: "useContext" },
	{ key: "useTransition", label: "useTransition" },
];

const demos: Record<Tab, ComponentFn> = {
	counter: CounterDemo,
	useRef: UseRefDemo,
	useMemo: UseMemoDemo,
	useId: UseIdDemo,
	useContext: UseContextDemo,
	useTransition: UseTransitionDemo,
};

export const App = function* (): Generator<EffectOp, MElement, unknown> {
	const [activeTab, setActiveTab] = yield* useState<Tab>("counter");

	return (
		<div>
			<h1>MReact.ts Playground</h1>
			<p class="hint">{text("u_s = commit . reconcile . render(s) — Algebraic effects via generators")}</p>
			<nav>
				{...tabs.map((t) =>
					h("button", { onClick: (_: unknown) => setActiveTab(t.key) }, text(t.label)),
				)}
			</nav>
			{h(demos[activeTab], {})}
		</div>
	);
};
