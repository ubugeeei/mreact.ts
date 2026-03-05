/**
 * useRef example — demonstrates mutable refs that persist across renders.
 *
 * Unlike useState, updating a ref does NOT trigger a re-render.
 * This makes refs ideal for:
 *   - Storing previous values
 *   - Tracking render counts
 *   - Holding DOM element references
 */

import { useState, useRef, useEffect, h, text } from "@mreact/core";
import type { FC } from "@mreact/dom";

export const UseRefApp: FC = function* () {
	const [count, setCount] = yield* useState(0);
	const renderCount = yield* useRef(0);

	// Increment render count on every render (via useEffect, no deps)
	yield* useEffect(() => {
		renderCount.current = renderCount.current + 1;
	});

	return (
		<div class="use-ref-demo">
			<h1>{text("useRef Demo")}</h1>
			<p>{text(`Count: ${count}`)}</p>
			<p>{text("(Render count is tracked in a ref — no re-render on update)")}</p>
			<button onClick={(_: unknown) => setCount(count + 1)}>+</button>
		</div>
	);
};
