/**
 * useCallback example — demonstrates cached event handlers.
 *
 * useCallback is a specialization of useMemo for functions.
 * It returns a stable reference to the callback, preventing
 * unnecessary re-renders of child components that receive it as a prop.
 */

import { useState, useCallback, h, text } from "@mreact/core";
import type { EventHandler } from "@mreact/core";
import type { FC } from "@mreact/dom";

export const UseCallbackApp: FC = function* () {
	const [count, setCount] = yield* useState(0);
	const [label, setLabel] = yield* useState("Click me");

	// This handler is cached and only recreated when `count` changes
	const cachedHandler = yield* useCallback<EventHandler>(
		(_) => {
			setCount(count + 1);
			console.log(`Clicked! count was ${count}`);
		},
		[count],
	);

	return (
		<div class="use-callback-demo">
			<h1>{text("useCallback Demo")}</h1>
			<p>{text(`Count: ${count}`)}</p>
			<p>{text(`Label: ${label}`)}</p>
			<button onClick={cachedHandler}>{text(label)}</button>
			<button onClick={(_: unknown) => setLabel("Clicked!")}>Change label</button>
		</div>
	);
};
