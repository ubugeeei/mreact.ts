/**
 * useId example — demonstrates stable unique identifier generation.
 *
 * useId generates a unique ID that is stable across re-renders.
 * This is useful for associating labels with form inputs via
 * for/id attributes, ensuring accessibility.
 */

import { useId, h, text } from "@mreact/core";
import type { FC } from "@mreact/dom";

export const UseIdApp: FC = function* () {
	const nameId = yield* useId();
	const emailId = yield* useId();

	return (
		<div>
			<h1>{text("useId Demo")}</h1>
			<div>
				<label for={nameId}>{text("Name: ")}</label>
				<input id={nameId} type="text" placeholder="Your name" />
			</div>
			<div>
				<label for={emailId}>{text("Email: ")}</label>
				<input id={emailId} type="email" placeholder="your@email.com" />
			</div>
			<p class="hint">{text(`Generated IDs: ${nameId}, ${emailId}`)}</p>
		</div>
	);
};
