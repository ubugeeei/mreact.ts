import { useState, useRef, useEffect, h, text, type EffectOp, type MElement } from "@mreact/core";

export const UseRefDemo = function* (): Generator<EffectOp, MElement, unknown> {
	const [count, setCount] = yield* useState(0);
	const renderCount = yield* useRef(0);

	yield* useEffect(() => {
		renderCount.current = renderCount.current + 1;
	});

	return (
		<div class="use-ref-demo">
			<h2>useRef Demo</h2>
			<p>{text(`Count: ${count}`)}</p>
			<p>{text(`Render count (ref): ${renderCount.current}`)}</p>
			<p class="hint">Updating a ref does NOT trigger a re-render</p>
			<button onClick={(_: unknown) => setCount(count + 1)}>+</button>
		</div>
	);
};
