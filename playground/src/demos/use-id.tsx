import { useId, h, text, type EffectOp, type MElement } from "@mreact/core";

export const UseIdDemo = function* (): Generator<EffectOp, MElement, unknown> {
	const nameId = yield* useId();
	const emailId = yield* useId();

	return (
		<div>
			<h2>useId Demo</h2>
			<div>
				<label for={nameId}>Name: </label>
				<input id={nameId} type="text" placeholder="Your name" />
			</div>
			<div>
				<label for={emailId}>Email: </label>
				<input id={emailId} type="email" placeholder="your@email.com" />
			</div>
			<p class="hint">{text(`Generated IDs: ${nameId}, ${emailId}`)}</p>
		</div>
	);
};
