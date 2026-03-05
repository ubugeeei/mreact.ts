/**
 * TSX Transpiler — transforms JSX-like syntax to MElement h() calls.
 *
 * Converts TSX source code into calls to `h()`:
 *   <div class="foo">Hello</div>
 *   → h("div", { class: "foo" }, text("Hello"))
 *
 *   <Counter count={0} />
 *   → h(Counter, { count: 0 })
 *
 * This is a simple recursive descent parser/transpiler, not a full
 * TypeScript parser. It handles the JSX subset needed for MReact.
 */

// ============================================================================
// Types
// ============================================================================

export interface TSXNode {
	kind: "element" | "fragment" | "text" | "expression";
}

export interface TSXElement extends TSXNode {
	kind: "element";
	tag: string;
	props: TSXProp[];
	children: TSXNode[];
	selfClosing: boolean;
}

export interface TSXFragment extends TSXNode {
	kind: "fragment";
	children: TSXNode[];
}

export interface TSXText extends TSXNode {
	kind: "text";
	content: string;
}

export interface TSXExpression extends TSXNode {
	kind: "expression";
	code: string;
}

export interface TSXProp {
	name: string;
	value: TSXPropValue;
}

export type TSXPropValue =
	| { kind: "string"; value: string }
	| { kind: "expression"; code: string }
	| { kind: "boolean" };

// ============================================================================
// Lexer
// ============================================================================

interface Token {
	type:
		| "openTag"
		| "closeTag"
		| "selfCloseTag"
		| "tagName"
		| "attrName"
		| "equals"
		| "string"
		| "openBrace"
		| "closeBrace"
		| "text"
		| "fragmentOpen"
		| "fragmentClose"
		| "slash"
		| "gt"
		| "lt"
		| "eof";
	value: string;
	pos: number;
}

export const tokenize = (source: string): Token[] => {
	const tokens: Token[] = [];
	let i = 0;

	while (i < source.length) {
		// Skip whitespace between tags (but preserve in text)
		if (source[i] === "<") {
			// Check for fragment close </>
			if (source[i + 1] === "/" && source[i + 2] === ">") {
				tokens.push({ type: "fragmentClose", value: "</>", pos: i });
				i += 3;
				continue;
			}

			// Check for fragment open <>
			if (source[i + 1] === ">") {
				tokens.push({ type: "fragmentOpen", value: "<>", pos: i });
				i += 2;
				continue;
			}

			// Check for closing tag </
			if (source[i + 1] === "/") {
				tokens.push({ type: "closeTag", value: "</", pos: i });
				i += 2;
				// Read tag name
				let name = "";
				while (i < source.length && /[\w.]/.test(source[i])) {
					name += source[i++];
				}
				tokens.push({ type: "tagName", value: name, pos: i });
				// Skip whitespace and >
				while (i < source.length && source[i] !== ">") i++;
				if (source[i] === ">") {
					tokens.push({ type: "gt", value: ">", pos: i });
					i++;
				}
				continue;
			}

			// Opening tag <
			tokens.push({ type: "lt", value: "<", pos: i });
			i++;

			// Read tag name
			let name = "";
			while (i < source.length && /[\w.]/.test(source[i])) {
				name += source[i++];
			}
			tokens.push({ type: "tagName", value: name, pos: i });

			// Read attributes until > or />
			while (i < source.length) {
				// Skip whitespace
				while (i < source.length && /\s/.test(source[i])) i++;

				if (source[i] === "/" && source[i + 1] === ">") {
					tokens.push({ type: "selfCloseTag", value: "/>", pos: i });
					i += 2;
					break;
				}
				if (source[i] === ">") {
					tokens.push({ type: "gt", value: ">", pos: i });
					i++;
					break;
				}

				// Attribute name
				let attrName = "";
				while (i < source.length && /[\w\-:]/.test(source[i])) {
					attrName += source[i++];
				}
				if (attrName) {
					tokens.push({
						type: "attrName",
						value: attrName,
						pos: i,
					});
				}

				// Skip whitespace
				while (i < source.length && /\s/.test(source[i])) i++;

				// = sign
				if (source[i] === "=") {
					tokens.push({ type: "equals", value: "=", pos: i });
					i++;
					// Skip whitespace
					while (i < source.length && /\s/.test(source[i])) i++;

					if (source[i] === '"' || source[i] === "'") {
						const quote = source[i++];
						let val = "";
						while (i < source.length && source[i] !== quote) {
							val += source[i++];
						}
						i++; // skip closing quote
						tokens.push({ type: "string", value: val, pos: i });
					} else if (source[i] === "{") {
						tokens.push({
							type: "openBrace",
							value: "{",
							pos: i,
						});
						i++;
						let depth = 1;
						let expr = "";
						while (i < source.length && depth > 0) {
							if (source[i] === "{") depth++;
							if (source[i] === "}") depth--;
							if (depth > 0) expr += source[i];
							i++;
						}
						tokens.push({
							type: "text",
							value: expr,
							pos: i,
						});
						tokens.push({
							type: "closeBrace",
							value: "}",
							pos: i,
						});
					}
				}
			}
			continue;
		}

		// JSX expression {expr}
		if (source[i] === "{") {
			tokens.push({ type: "openBrace", value: "{", pos: i });
			i++;
			let depth = 1;
			let expr = "";
			while (i < source.length && depth > 0) {
				if (source[i] === "{") depth++;
				if (source[i] === "}") depth--;
				if (depth > 0) expr += source[i];
				i++;
			}
			tokens.push({ type: "text", value: expr.trim(), pos: i });
			tokens.push({ type: "closeBrace", value: "}", pos: i });
			continue;
		}

		// Text content
		let content = "";
		while (i < source.length && source[i] !== "<" && source[i] !== "{") {
			content += source[i++];
		}
		if (content.trim()) {
			tokens.push({ type: "text", value: content.trim(), pos: i });
		}
	}

	tokens.push({ type: "eof", value: "", pos: i });
	return tokens;
};

// ============================================================================
// Parser — tokens → TSX AST
// ============================================================================

export const parse = (tokens: Token[]): TSXNode => {
	let pos = 0;

	const peek = (): Token => tokens[pos] ?? { type: "eof", value: "", pos: 0 };
	const next = (): Token => tokens[pos++] ?? { type: "eof", value: "", pos: 0 };
	const expect = (type: Token["type"]): Token => {
		const t = next();
		if (t.type !== type) {
			throw new Error(
				`TSX parse error: expected ${type}, got ${t.type} ("${t.value}") at pos ${t.pos}`,
			);
		}
		return t;
	};

	const parseNode = (): TSXNode => {
		const t = peek();

		if (t.type === "fragmentOpen") {
			return parseFragment();
		}
		if (t.type === "lt") {
			return parseElement();
		}
		if (t.type === "openBrace") {
			return parseExpression();
		}
		if (t.type === "text") {
			next();
			return { kind: "text", content: t.value } as TSXText;
		}

		throw new Error(
			`TSX parse error: unexpected token ${t.type} ("${t.value}") at pos ${t.pos}`,
		);
	};

	const parseElement = (): TSXElement => {
		expect("lt"); // <
		const tagToken = expect("tagName");
		const tag = tagToken.value;
		const props: TSXProp[] = [];

		// Parse attributes
		while (peek().type === "attrName") {
			const nameToken = next();
			if (peek().type === "equals") {
				next(); // =
				const valToken = peek();
				if (valToken.type === "string") {
					next();
					props.push({
						name: nameToken.value,
						value: { kind: "string", value: valToken.value },
					});
				} else if (valToken.type === "openBrace") {
					next(); // {
					const exprToken = expect("text");
					expect("closeBrace"); // }
					props.push({
						name: nameToken.value,
						value: { kind: "expression", code: exprToken.value },
					});
				}
			} else {
				// Boolean attribute
				props.push({
					name: nameToken.value,
					value: { kind: "boolean" },
				});
			}
		}

		// Self-closing?
		if (peek().type === "selfCloseTag") {
			next();
			return {
				kind: "element",
				tag,
				props,
				children: [],
				selfClosing: true,
			};
		}

		expect("gt"); // >

		// Parse children
		const children: TSXNode[] = [];
		while (
			peek().type !== "closeTag" &&
			peek().type !== "eof"
		) {
			children.push(parseNode());
		}

		// Closing tag
		expect("closeTag"); // </
		expect("tagName"); // tag name
		expect("gt"); // >

		return { kind: "element", tag, props, children, selfClosing: false };
	};

	const parseFragment = (): TSXFragment => {
		expect("fragmentOpen"); // <>
		const children: TSXNode[] = [];
		while (peek().type !== "fragmentClose" && peek().type !== "eof") {
			children.push(parseNode());
		}
		expect("fragmentClose"); // </>
		return { kind: "fragment", children };
	};

	const parseExpression = (): TSXExpression => {
		expect("openBrace"); // {
		const exprToken = expect("text");
		expect("closeBrace"); // }
		return { kind: "expression", code: exprToken.value };
	};

	return parseNode();
};

// ============================================================================
// Code generator — TSX AST → h() calls
// ============================================================================

export const generate = (node: TSXNode): string => {
	switch (node.kind) {
		case "text":
			return `text(${JSON.stringify((node as TSXText).content)})`;

		case "expression":
			return (node as TSXExpression).code;

		case "fragment": {
			const f = node as TSXFragment;
			const children = f.children.map(generate).join(", ");
			return `fragment(${children})`;
		}

		case "element": {
			const el = node as TSXElement;
			const isComponent = el.tag[0] === el.tag[0].toUpperCase();
			const tag = isComponent ? el.tag : JSON.stringify(el.tag);

			const propsStr = generateProps(el.props);
			const childrenStr = el.children.map(generate).join(", ");

			if (el.children.length === 0) {
				return `h(${tag}, ${propsStr})`;
			}
			return `h(${tag}, ${propsStr}, ${childrenStr})`;
		}
	}
};

const generateProps = (props: TSXProp[]): string => {
	if (props.length === 0) return "{}";

	const entries = props.map((p) => {
		const key = /^[a-zA-Z_$][\w$]*$/.test(p.name)
			? p.name
			: JSON.stringify(p.name);

		switch (p.value.kind) {
			case "string":
				return `${key}: ${JSON.stringify(p.value.value)}`;
			case "expression":
				return `${key}: ${p.value.code}`;
			case "boolean":
				return `${key}: true`;
		}
	});

	return `{ ${entries.join(", ")} }`;
};

// ============================================================================
// Public API: transpile TSX string → h() code
// ============================================================================

export const transpile = (source: string): string => {
	const tokens = tokenize(source);
	const ast = parse(tokens);
	return generate(ast);
};

// ============================================================================
// Full source transformation — find and replace JSX in TypeScript source
//
// Walks the source, identifies JSX regions (not inside strings/comments),
// transpiles them with the parser above, and stitches the result back.
// Also injects `import { h, text, fragment } from "@mreact/core"` if needed.
// ============================================================================

export const transformSource = (source: string): string => {
	const regions = findJSXRegions(source);
	if (regions.length === 0) return source;

	// Build result by replacing regions back-to-front to preserve offsets
	let result = source;
	for (let i = regions.length - 1; i >= 0; i--) {
		const region = regions[i];
		const jsxSource = result.slice(region.start, region.end);
		try {
			const code = transpile(jsxSource);
			result = result.slice(0, region.start) + code + result.slice(region.end);
		} catch {
			// If parsing fails, leave as-is (could be a type param like <T>)
		}
	}

	// Inject imports if h/text/fragment aren't already imported
	result = ensureImports(result);

	return result;
};

interface JSXRegion {
	start: number;
	end: number;
}

const findJSXRegions = (source: string): JSXRegion[] => {
	const regions: JSXRegion[] = [];
	let i = 0;

	while (i < source.length) {
		// Skip string literals
		if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
			i = skipString(source, i);
			continue;
		}

		// Skip line comments
		if (source[i] === "/" && source[i + 1] === "/") {
			while (i < source.length && source[i] !== "\n") i++;
			continue;
		}

		// Skip block comments
		if (source[i] === "/" && source[i + 1] === "*") {
			i += 2;
			while (i < source.length - 1 && !(source[i] === "*" && source[i + 1] === "/")) i++;
			i += 2;
			continue;
		}

		// Check for JSX start: < followed by identifier or <>
		if (source[i] === "<") {
			// Fragment: <>
			if (source[i + 1] === ">") {
				const end = findJSXEnd(source, i);
				if (end > i) {
					regions.push({ start: i, end });
					i = end;
					continue;
				}
			}

			// Element: <Tag or <tag
			const nextChar = source[i + 1];
			if (nextChar && /[a-zA-Z_]/.test(nextChar)) {
				// Heuristic: check context — JSX typically follows =, (, return, ?, :, &&, ||, ,
				const before = source.slice(Math.max(0, i - 20), i).trimEnd();
				const isJSXContext =
					before.endsWith("=") ||
					before.endsWith("(") ||
					before.endsWith(",") ||
					before.endsWith("?") ||
					before.endsWith(":") ||
					before.endsWith("&&") ||
					before.endsWith("||") ||
					before.endsWith("return") ||
					before.endsWith("=>") ||
					before.endsWith("{") ||
					before.length === 0;

				if (isJSXContext) {
					const end = findJSXEnd(source, i);
					if (end > i) {
						regions.push({ start: i, end });
						i = end;
						continue;
					}
				}
			}
		}

		i++;
	}

	return regions;
};

const skipString = (source: string, start: number): number => {
	const quote = source[start];
	let i = start + 1;
	if (quote === "`") {
		// Template literal — handle ${} nesting
		while (i < source.length) {
			if (source[i] === "\\" && i + 1 < source.length) { i += 2; continue; }
			if (source[i] === "`") return i + 1;
			if (source[i] === "$" && source[i + 1] === "{") {
				i += 2;
				let depth = 1;
				while (i < source.length && depth > 0) {
					if (source[i] === "{") depth++;
					if (source[i] === "}") depth--;
					if (depth > 0) i++;
					else { i++; break; }
				}
				continue;
			}
			i++;
		}
	} else {
		while (i < source.length) {
			if (source[i] === "\\" && i + 1 < source.length) { i += 2; continue; }
			if (source[i] === quote) return i + 1;
			i++;
		}
	}
	return i;
};

const findJSXEnd = (source: string, start: number): number => {
	// Try to tokenize from this position and find the end of the JSX expression
	// We need to find the balanced end of the JSX tree
	let i = start;

	// Fragment
	if (source[i] === "<" && source[i + 1] === ">") {
		i += 2;
		let depth = 1;
		while (i < source.length && depth > 0) {
			if (source[i] === "<" && source[i + 1] === ">" && source[i - 1] !== "/") {
				depth++;
				i += 2;
			} else if (source[i] === "<" && source[i + 1] === "/" && source[i + 2] === ">") {
				depth--;
				if (depth === 0) return i + 3;
				i += 3;
			} else {
				i++;
			}
		}
		return -1;
	}

	// Element: <Tag ...>...</Tag> or <Tag ... />
	if (source[i] !== "<") return -1;
	i++;

	// Read tag name
	let tag = "";
	while (i < source.length && /[\w.]/.test(source[i])) {
		tag += source[i++];
	}
	if (!tag) return -1;

	// Skip attributes until > or />
	i = skipAttributes(source, i);
	if (i >= source.length) return -1;

	// Self-closing
	if (source[i] === "/" && source[i + 1] === ">") {
		return i + 2;
	}

	if (source[i] !== ">") return -1;
	i++; // skip >

	// Find matching closing tag, handling nesting
	let depth = 1;
	while (i < source.length && depth > 0) {
		if (source[i] === "<") {
			if (source[i + 1] === "/") {
				// Could be closing tag
				i += 2;
				let closeTag = "";
				while (i < source.length && /[\w.]/.test(source[i])) {
					closeTag += source[i++];
				}
				while (i < source.length && source[i] !== ">") i++;
				if (source[i] === ">") i++;
				if (closeTag === tag) {
					depth--;
					if (depth === 0) return i;
				}
			} else if (/[a-zA-Z_]/.test(source[i + 1] ?? "")) {
				// Nested opening tag — check if it's the same tag
				i++;
				let nestedTag = "";
				while (i < source.length && /[\w.]/.test(source[i])) {
					nestedTag += source[i++];
				}
				i = skipAttributes(source, i);
				if (source[i] === "/" && source[i + 1] === ">") {
					i += 2; // self-closing, no depth change
				} else if (source[i] === ">") {
					i++;
					if (nestedTag === tag) depth++;
				}
			} else if (source[i + 1] === ">") {
				// Fragment open <>
				i += 2;
			} else {
				i++;
			}
		} else if (source[i] === "{") {
			// Skip expression
			i++;
			let braceDepth = 1;
			while (i < source.length && braceDepth > 0) {
				if (source[i] === "{") braceDepth++;
				if (source[i] === "}") braceDepth--;
				if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
					i = skipString(source, i);
					continue;
				}
				i++;
			}
		} else {
			i++;
		}
	}

	return -1;
};

const skipAttributes = (source: string, start: number): number => {
	let i = start;
	while (i < source.length) {
		// Skip whitespace
		while (i < source.length && /\s/.test(source[i])) i++;

		if (source[i] === "/" && source[i + 1] === ">") return i;
		if (source[i] === ">") return i;

		// Attribute name
		if (/[\w\-:]/.test(source[i])) {
			while (i < source.length && /[\w\-:]/.test(source[i])) i++;
			// Skip whitespace
			while (i < source.length && /\s/.test(source[i])) i++;
			// = and value
			if (source[i] === "=") {
				i++;
				while (i < source.length && /\s/.test(source[i])) i++;
				if (source[i] === '"' || source[i] === "'") {
					i = skipString(source, i);
				} else if (source[i] === "{") {
					i++;
					let depth = 1;
					while (i < source.length && depth > 0) {
						if (source[i] === "{") depth++;
						if (source[i] === "}") depth--;
						if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
							i = skipString(source, i);
							continue;
						}
						i++;
					}
				}
			}
		} else {
			break;
		}
	}
	return i;
};

const ensureImports = (source: string): string => {
	const needsH = source.includes("h(") && !/ h[\s,}]/.test(source.split("\n").find((l) => l.includes("import") && l.includes("h")) ?? "");
	const needsText = source.includes("text(") && !source.includes("import") || false;
	const needsFragment = source.includes("fragment(") && !source.includes("import") || false;

	// If the transformed code already has the right imports, skip
	if (!needsH && !needsText && !needsFragment) return source;

	// Check if @mreact/core import exists
	const coreImportRe = /import\s*\{([^}]+)\}\s*from\s*["']@mreact\/core["']/;
	const match = source.match(coreImportRe);

	if (match) {
		const existing = match[1];
		const toAdd: string[] = [];
		if (source.includes("h(") && !existing.includes(" h") && !existing.includes(",h")) toAdd.push("h");
		if (source.includes("text(") && !existing.includes("text")) toAdd.push("text");
		if (source.includes("fragment(") && !existing.includes("fragment")) toAdd.push("fragment");

		if (toAdd.length > 0) {
			const newImports = `${existing.trimEnd()}, ${toAdd.join(", ")}`;
			return source.replace(match[1], newImports);
		}
	}

	return source;
};
