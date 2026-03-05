import { useState, useEffect, h, text, type EffectOp, type MElement } from "@mreact/core";

export const CounterDemo = function* (): Generator<EffectOp, MElement, unknown> {
	const [count, setCount] = yield* useState(0);

	yield* useEffect(() => {
		document.title = `Count: ${count}`;
	}, [count]);

	return (
		<div class="counter">
			<h2>Counter</h2>
			<p>{text(`Count: ${count}`)}</p>
			<p>{text(`Double: ${count * 2}`)}</p>
			<p>{text(`Parity: ${count % 2 === 0 ? "even" : "odd"}`)}</p>
			<button onClick={(_: unknown) => setCount(count + 1)}>+</button>
			<button onClick={(_: unknown) => setCount(count - 1)}>-</button>
			<button onClick={(_: unknown) => setCount(0)}>Reset</button>
		</div>
	);
};
