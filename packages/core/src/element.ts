/**
 * MElement — what components produce (like React.createElement output).
 *
 * This is the lightweight description that the reconciler converts
 * into FiberNode trees. Not a VDOM — the Fiber IS the reconciliation unit.
 */

// ============================================================================
// Types
// ============================================================================

export type EventName = string;

export type EventHandler = (event: DOMEvent) => void;

export interface DOMEvent {
	readonly type: string;
	readonly target: string;
}

export type Props = Record<string, unknown>;

export type MElement =
	| MHostElement
	| MComponentElement
	| MTextElement
	| MFragmentElement
	| MSuspenseElement
	| MServerElement
	| null;

export interface MHostElement {
	readonly kind: "host";
	readonly type: string;
	readonly props: Props;
	readonly children: MElement[];
}

export interface MComponentElement {
	readonly kind: "component";
	readonly type: ComponentFn;
	readonly props: Props;
	readonly key: string | null;
}

export interface MTextElement {
	readonly kind: "text";
	readonly content: string;
}

export interface MFragmentElement {
	readonly kind: "fragment";
	readonly children: MElement[];
}

export interface MSuspenseElement {
	readonly kind: "suspense";
	readonly fallback: MElement;
	readonly children: MElement[];
}

/** Server Component element — rendered on server, serialized via Flight. */
export interface MServerElement {
	readonly kind: "server";
	readonly type: ServerComponentFn;
	readonly props: Props;
}

export type ComponentFn = (props: Props) => Generator<
	import("./hooks.ts").EffectOp,
	MElement,
	unknown
>;

export type ServerComponentFn = (
	props: Props,
) => Promise<MElement> | MElement;

// ============================================================================
// Constructors (arrow functions)
// ============================================================================

export const h = (
	type: string | ComponentFn,
	props: Props,
	...children: MElement[]
): MElement => {
	if (typeof type === "function") {
		return {
			kind: "component",
			type: type as ComponentFn,
			props: { ...props, children },
			key: (props?.key as string) ?? null,
		};
	}
	return { kind: "host", type, props, children };
};

export const text = (content: string): MTextElement => ({
	kind: "text",
	content,
});

export const fragment = (...children: MElement[]): MFragmentElement => ({
	kind: "fragment",
	children,
});

export const suspenseElement = (
	fallback: MElement,
	...children: MElement[]
): MSuspenseElement => ({
	kind: "suspense",
	fallback,
	children,
});

export const serverElement = (
	type: ServerComponentFn,
	props: Props,
): MServerElement => ({
	kind: "server",
	type,
	props,
});

export const nullElement: null = null;
