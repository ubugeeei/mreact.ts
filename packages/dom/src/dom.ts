/**
 * HTML element DSL — JSX equivalent for MReact.
 *
 * Produces MElement descriptions that the reconciler converts to Fiber nodes.
 */

import type { MElement, Props, EventHandler } from "@mreact/core";
import { h, text, fragment, suspenseElement, nullElement } from "@mreact/core";

// ============================================================================
// Prop helpers
// ============================================================================

export const class_ = (v: string): Props => ({ class: v });
export const id_ = (v: string): Props => ({ id: v });
export const style_ = (v: string): Props => ({ style: v });
export const href_ = (v: string): Props => ({ href: v });
export const src_ = (v: string): Props => ({ src: v });
export const type_ = (v: string): Props => ({ type: v });
export const value_ = (v: string): Props => ({ value: v });
export const placeholder_ = (v: string): Props => ({ placeholder: v });
export const for_ = (v: string): Props => ({ for: v });

export const onClick = (handler: EventHandler): Props => ({
	onClick: handler,
});
export const onInput = (handler: EventHandler): Props => ({
	onInput: handler,
});
export const onSubmit = (handler: EventHandler): Props => ({
	onSubmit: handler,
});
export const onChange = (handler: EventHandler): Props => ({
	onChange: handler,
});

/** Merge multiple prop objects. */
export const props = (...ps: Props[]): Props => Object.assign({}, ...ps);

// ============================================================================
// Element constructors (arrow functions)
// ============================================================================

const el =
	(tag: string) =>
	(p: Props, ...children: MElement[]): MElement =>
		h(tag, p, ...children);

// Layout
export const div = el("div");
export const span = el("span");
export const p_ = el("p");
export const section = el("section");
export const article = el("article");
export const aside = el("aside");
export const header = el("header");
export const footer = el("footer");
export const main = el("main");
export const nav = el("nav");

// Headings
export const h1 = el("h1");
export const h2 = el("h2");
export const h3 = el("h3");
export const h4 = el("h4");
export const h5 = el("h5");
export const h6 = el("h6");

// Text elements
export const em = el("em");
export const strong = el("strong");
export const code = el("code");
export const pre = el("pre");
export const blockquote = el("blockquote");

// Lists
export const ul = el("ul");
export const ol = el("ol");
export const li = el("li");

// Tables
export const table = el("table");
export const thead = el("thead");
export const tbody = el("tbody");
export const tr = el("tr");
export const th = el("th");
export const td = el("td");

// Forms
export const form = el("form");
export const label = el("label");
export const input = (p: Props): MElement => h("input", p);
export const textarea = el("textarea");
export const select = el("select");
export const option = el("option");
export const button = el("button");

// Media / links
export const img = (p: Props): MElement => h("img", p);
export const a = el("a");

// Re-exports
export { text, fragment, suspenseElement as suspense, nullElement, h };
