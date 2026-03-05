import { useState, useMemo, h, text, type EffectOp, type MElement } from "@mreact/core";

const fibonacci = (n: number): number => {
	if (n <= 0) return 0;
	if (n === 1) return 1;
	return fibonacci(n - 1) + fibonacci(n - 2);
};

export const UseMemoDemo = function* (): Generator<EffectOp, MElement, unknown> {
	const [n, setN] = yield* useState(10);
	const fib = yield* useMemo(() => fibonacci(n), [n]);

	return (
		<div class="use-memo-demo">
			<h2>useMemo Demo</h2>
			<p>{text(`n = ${n}`)}</p>
			<p>{text(`fibonacci(n) = ${fib}`)}</p>
			<button onClick={(_: unknown) => setN(n + 1)}>+</button>
			<button onClick={(_: unknown) => setN(Math.max(0, n - 1))}>-</button>
		</div>
	);
};
