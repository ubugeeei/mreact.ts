/**
 * useMemo example — demonstrates memoized computation.
 *
 * useMemo caches the result and only recomputes when deps change.
 * Without memoization, the computation would run on every render.
 */

import { useState, useMemo, h, text } from "@mreact/core";
import type { FC } from "@mreact/dom";

// Naive fibonacci (intentionally slow for large n)
const fibonacci = (n: number): number => {
	if (n <= 0) return 0;
	if (n === 1) return 1;
	return fibonacci(n - 1) + fibonacci(n - 2);
};

export const UseMemoApp: FC = function* () {
	const [n, setN] = yield* useState(10);

	// Only recomputed when `n` changes
	const fib = yield* useMemo(() => fibonacci(n), [n]);

	return (
		<div class="use-memo-demo">
			<h1>{text("useMemo Demo")}</h1>
			<p>{text(`n = ${n}`)}</p>
			<p>{text(`fibonacci(n) = ${fib}`)}</p>
			<button onClick={(_: unknown) => setN(n + 1)}>+</button>
			<button onClick={(_: unknown) => setN(Math.max(0, n - 1))}>-</button>
		</div>
	);
};
