/**
 * Flight protocol — RSC wire format for serializing/deserializing
 * the React Server Component tree.
 *
 * Flight is the serialization protocol that sends server component
 * output to the client. It encodes:
 *   - Server component rendered output (MElement tree)
 *   - Client component references (module + export name)
 *   - Serialized props
 *   - Streaming chunks for Suspense boundaries
 *
 * Wire format (simplified, newline-delimited JSON):
 *   Each line is: `id:type:payload`
 *   Types: J (JSON), S (Symbol/reference), P (Promise/chunk)
 */

import type { MElement, ServerComponentFn, Props } from "@mreact/core";

// ============================================================================
// Types
// ============================================================================

export type FlightChunkType = "J" | "S" | "P" | "E";

export interface FlightChunk {
	id: number;
	type: FlightChunkType;
	payload: string;
}

export interface FlightRow {
	id: number;
	type: FlightChunkType;
	value: unknown;
}

export interface ClientReference {
	/** Module specifier (e.g. "./Counter.tsx") */
	module: string;
	/** Export name (e.g. "Counter" or "default") */
	name: string;
}

export interface FlightManifest {
	/** Map of client component ID -> module reference */
	clientModules: Map<string, ClientReference>;
}

/** Marker for client components in the RSC tree. */
export const CLIENT_REFERENCE = Symbol.for("mreact.client.reference");

export interface ClientComponentMarker {
	$$typeof: typeof CLIENT_REFERENCE;
	ref: ClientReference;
	props: Props;
}

// ============================================================================
// Server-side: serialize MElement tree to Flight stream
// ============================================================================

export const createFlightEncoder = () => {
	let nextId = 0;
	const chunks: FlightChunk[] = [];

	const encodeElement = (element: MElement): number => {
		const id = nextId++;

		if (element === null) {
			chunks.push({ id, type: "J", payload: "null" });
			return id;
		}

		switch (element.kind) {
			case "text":
				chunks.push({
					id,
					type: "J",
					payload: JSON.stringify({
						kind: "text",
						content: element.content,
					}),
				});
				break;

			case "host": {
				const childIds = element.children.map(encodeElement);
				chunks.push({
					id,
					type: "J",
					payload: JSON.stringify({
						kind: "host",
						type: element.type,
						props: serializeProps(element.props),
						children: childIds,
					}),
				});
				break;
			}

			case "component": {
				// Client component — encode as a reference
				chunks.push({
					id,
					type: "S",
					payload: JSON.stringify({
						kind: "client_ref",
						props: serializeProps(element.props),
					}),
				});
				break;
			}

			case "fragment": {
				const childIds = element.children.map(encodeElement);
				chunks.push({
					id,
					type: "J",
					payload: JSON.stringify({
						kind: "fragment",
						children: childIds,
					}),
				});
				break;
			}

			case "suspense": {
				const fallbackId = encodeElement(element.fallback);
				const childIds = element.children.map(encodeElement);
				chunks.push({
					id,
					type: "J",
					payload: JSON.stringify({
						kind: "suspense",
						fallback: fallbackId,
						children: childIds,
					}),
				});
				break;
			}

			case "server": {
				// Server component — resolve it and encode the result
				// For streaming, this would be a Promise chunk
				chunks.push({
					id,
					type: "P",
					payload: JSON.stringify({
						kind: "server_pending",
						type: element.type.name,
					}),
				});
				break;
			}
		}

		return id;
	};

	const toFlightStream = (): string =>
		chunks.map((c) => `${c.id}:${c.type}:${c.payload}`).join("\n");

	return { encodeElement, toFlightStream, chunks };
};

// ============================================================================
// Client-side: decode Flight stream to MElement tree
// ============================================================================

export const createFlightDecoder = () => {
	const resolvedChunks = new Map<number, unknown>();
	const pendingChunks = new Map<
		number,
		{ resolve: (v: unknown) => void; promise: Promise<unknown> }
	>();

	const processLine = (line: string): void => {
		const colonIdx = line.indexOf(":");
		const secondColon = line.indexOf(":", colonIdx + 1);
		const id = Number.parseInt(line.slice(0, colonIdx), 10);
		const type = line.slice(colonIdx + 1, secondColon) as FlightChunkType;
		const payload = line.slice(secondColon + 1);

		const value = { type, data: JSON.parse(payload) };
		resolvedChunks.set(id, value);

		const pending = pendingChunks.get(id);
		if (pending) {
			pending.resolve(value);
			pendingChunks.delete(id);
		}
	};

	const decode = (stream: string): void => {
		const lines = stream.split("\n").filter((l) => l.length > 0);
		for (const line of lines) {
			processLine(line);
		}
	};

	const getChunk = (id: number): unknown => resolvedChunks.get(id);

	const waitForChunk = (id: number): Promise<unknown> => {
		const existing = resolvedChunks.get(id);
		if (existing !== undefined) return Promise.resolve(existing);

		let res: (v: unknown) => void;
		const promise = new Promise<unknown>((r) => {
			res = r;
		});
		pendingChunks.set(id, { resolve: res!, promise });
		return promise;
	};

	const reconstructElement = (id: number): MElement => {
		const chunk = resolvedChunks.get(id) as
			| { type: string; data: Record<string, unknown> }
			| undefined;
		if (!chunk) return null;

		const data = chunk.data;
		switch (data.kind) {
			case "text":
				return { kind: "text", content: data.content as string };
			case "host":
				return {
					kind: "host",
					type: data.type as string,
					props: (data.props as Props) ?? {},
					children: (data.children as number[]).map(reconstructElement),
				};
			case "fragment":
				return {
					kind: "fragment",
					children: (data.children as number[]).map(reconstructElement),
				};
			case "suspense":
				return {
					kind: "suspense",
					fallback: reconstructElement(data.fallback as number),
					children: (data.children as number[]).map(reconstructElement),
				};
			default:
				return null;
		}
	};

	return { decode, getChunk, waitForChunk, reconstructElement };
};

// ============================================================================
// Server-side: resolve server components to produce Flight data
// ============================================================================

export const renderServerComponent = async (
	fn: ServerComponentFn,
	props: Props,
): Promise<MElement> => {
	const result = fn(props);
	if (result instanceof Promise) {
		return await result;
	}
	return result;
};

export const renderToFlight = async (element: MElement): Promise<string> => {
	const resolved = await resolveServerElements(element);
	const encoder = createFlightEncoder();
	encoder.encodeElement(resolved);
	return encoder.toFlightStream();
};

const resolveServerElements = async (
	element: MElement,
): Promise<MElement> => {
	if (element === null) return null;

	switch (element.kind) {
		case "server": {
			const result = await renderServerComponent(
				element.type,
				element.props,
			);
			return resolveServerElements(result);
		}
		case "host":
			return {
				...element,
				children: await Promise.all(
					element.children.map(resolveServerElements),
				),
			};
		case "fragment":
			return {
				...element,
				children: await Promise.all(
					element.children.map(resolveServerElements),
				),
			};
		case "suspense":
			return {
				...element,
				fallback: await resolveServerElements(element.fallback),
				children: await Promise.all(
					element.children.map(resolveServerElements),
				),
			};
		default:
			return element;
	}
};

// ============================================================================
// Helpers
// ============================================================================

type Props = Record<string, unknown>;

const serializeProps = (props: Props): Props => {
	const result: Props = {};
	for (const [k, v] of Object.entries(props)) {
		if (typeof v === "function") continue;
		if (k === "children") continue;
		result[k] = v;
	}
	return result;
};
