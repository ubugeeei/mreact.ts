/**
 * Counter example — demonstrates useState and useEffect as algebraic effects.
 *
 * The component is a generator. Each `yield*` is a "perform" operation.
 * The reconciler (effect handler) intercepts each yield and resumes
 * the generator with the appropriate value.
 */

import { useState, useEffect, h, text } from "@mreact/core";
import type { FC } from "@mreact/dom";

export const Counter: FC = function* () {
	const [count, setCount] = yield* useState(0);

	const doubleCount = count * 2;
	const parity = count % 2 === 0 ? "even" : "odd";

	yield* useEffect(() => {
		console.log(`Count changed (from useEffect): ${count}`);
	}, [count]);

	return (
		<div class="counter">
			<h1>{text("Counter")}</h1>
			<p>{text(`Count: ${count}`)}</p>
			<p>{text(`Double: ${doubleCount}`)}</p>
			<p>{text(`Parity: ${parity}`)}</p>
			<button onClick={(_: unknown) => setCount(count + 1)}>+</button>
			<button onClick={(_: unknown) => setCount(count - 1)}>-</button>
			<button onClick={(_: unknown) => setCount(0)}>Reset</button>
		</div>
	);
};
