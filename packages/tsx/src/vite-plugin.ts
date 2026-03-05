/**
 * Vite plugin for MReact TSX transformation.
 *
 * Transforms JSX syntax in .tsx files to h() calls using
 * the mreact TSX transpiler, before Vite/esbuild processes them.
 *
 * Usage in vite.config.ts:
 *   import { mreactTsx } from "@mreact/tsx/vite-plugin";
 *   export default { plugins: [mreactTsx()] };
 */

import { transformSource } from "./tsx.ts";

export interface MReactTsxOptions {
	/** File extensions to transform (default: [".tsx"]) */
	extensions?: string[];
	/** Directories to include (default: all) */
	include?: string[];
	/** Directories to exclude (default: ["node_modules"]) */
	exclude?: string[];
}

export const mreactTsx = (options: MReactTsxOptions = {}) => {
	const extensions = options.extensions ?? [".tsx"];
	const exclude = options.exclude ?? ["node_modules"];

	return {
		name: "mreact-tsx",
		enforce: "pre" as const,

		transform(code: string, id: string) {
			// Only process matching files
			if (!extensions.some((ext) => id.endsWith(ext))) return null;
			if (exclude.some((dir) => id.includes(dir))) return null;

			// Check if the file contains any JSX-like syntax
			if (!containsJSX(code)) return null;

			const transformed = transformSource(code);
			if (transformed === code) return null;

			return {
				code: transformed,
				map: null,
			};
		},
	};
};

const containsJSX = (source: string): boolean => {
	// Quick heuristic: look for < followed by an identifier that isn't a comparison
	// This is intentionally loose — the real parser handles false positives
	return /<[A-Z][\w.]*[\s>\/]/.test(source) || /<[a-z][\w-]*[\s>\/]/.test(source) || /<>/.test(source);
};
