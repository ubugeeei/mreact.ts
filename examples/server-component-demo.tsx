/**
 * Server Component demo — RSC + Flight + Streaming.
 *
 * Server Components are async functions (not generators).
 * They cannot use hooks (no algebraic effects).
 * Their output is serialized via Flight and streamed to the client.
 */

import { serverElement, suspenseElement, h, text } from "@mreact/core";
import { renderToFlight, createFlightDecoder } from "@mreact/server";
import { renderToStream } from "@mreact/server";
import type { ServerFC } from "@mreact/dom";

// ============================================================================
// Server Components (async, no hooks)
// ============================================================================

const UserProfile: ServerFC = async (_props) => (
	<div>
		<h1>{text("Alice")}</h1>
		<p>{text("Haskell enthusiast")}</p>
	</div>
);

const PostList: ServerFC = async (_props) => {
	const posts = [
		{ id: 1, title: "Indexed Monads in TypeScript" },
		{ id: 2, title: "Algebraic Effects with Generators" },
		{ id: 3, title: "Fiber Architecture from Scratch" },
	];
	return (
		<ul>
			{...posts.map((post) => <li>{text(post.title)}</li>)}
		</ul>
	);
};

// ============================================================================
// Demo: Flight serialization
// ============================================================================

export const flightDemo = async (): Promise<void> => {
	console.log("=== Flight Protocol Demo ===\n");

	const element = (
		<div>
			<h1>{text("MReact Server Components")}</h1>
			{serverElement(UserProfile, {})}
			{serverElement(PostList, {})}
		</div>
	);

	const flightData = await renderToFlight(element);
	console.log("Flight stream:");
	console.log(flightData);

	const decoder = createFlightDecoder();
	decoder.decode(flightData);
	const rootElement = decoder.reconstructElement(2);
	console.log("Reconstructed:", JSON.stringify(rootElement, null, 2));
};

// ============================================================================
// Demo: Streaming SSR
// ============================================================================

export const streamingDemo = async (): Promise<void> => {
	console.log("\n=== Streaming SSR Demo ===\n");

	const element = (
		<div>
			<h1>{text("Streaming SSR")}</h1>
			<p>{text("This content renders immediately.")}</p>
			{suspenseElement(
				<p>{text("Loading...")}</p>,
				<p>{text("This would stream in after data loads.")}</p>,
			)}
		</div>
	);

	const { shell, pendingBoundaries, allReady } = renderToStream(element);
	console.log("Shell HTML:", shell);
	console.log(`Pending boundaries: ${pendingBoundaries.length}`);
	await allReady;
	console.log("All boundaries resolved.");
};
