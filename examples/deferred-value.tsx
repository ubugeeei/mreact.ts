/**
 * useDeferredValue demo — stale-while-revalidate pattern.
 */

import { useState, useDeferredValue, h, text } from "@mreact/core";
import type { FC } from "@mreact/dom";

export const DeferredApp: FC = function* () {
	const [query, setQuery] = yield* useState("");
	const deferredQuery = yield* useDeferredValue(query);

	return (
		<div>
			<p>{text(`query: ${JSON.stringify(query)}`)}</p>
			<p>{text(`deferred: ${JSON.stringify(deferredQuery)}`)}</p>
			<button onClick={(_: unknown) => setQuery("abc")}>search</button>
		</div>
	);
};
