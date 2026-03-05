/**
 * Suspense demo — demonstrates use + suspense + Async.
 *
 * `use` has identity index (safe inside control flow).
 * When Async is pending, SuspendException is thrown.
 * The nearest Suspense boundary catches it and shows fallback.
 */

import { useState, h, text, suspenseElement } from "@mreact/core";
import type { MElement } from "@mreact/core";
import type { FC } from "@mreact/dom";

// ============================================================================
// Container with Suspense boundary
// ============================================================================

export const SuspenseDemo: FC = function* () {
	const [showTodos, setShowTodos] = yield* useState(true);

	const content: MElement = showTodos
		? suspenseElement(
				<p>{text("Loading todos...")}</p>,
				<ul>
					<li>{text("Buy milk")}</li>
					<li>{text("Write code")}</li>
				</ul>,
			)
		: <div>{text("Todos hidden")}</div>;

	return (
		<div>
			<button onClick={(_: unknown) => setShowTodos(!showTodos)}>
				{text(showTodos ? "Hide" : "Show")}
			</button>
			{content}
		</div>
	);
};
