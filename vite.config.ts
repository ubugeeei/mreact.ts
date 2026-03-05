import { defineConfig } from "vite";
import { mreactTsx } from "./packages/tsx/src/vite-plugin.ts";
import path from "node:path";

export default defineConfig({
	root: "playground",
	plugins: [
		mreactTsx(),
	],
	resolve: {
		alias: {
			"@mreact/core": path.resolve(__dirname, "packages/core/src/index.ts"),
			"@mreact/dom/client": path.resolve(__dirname, "packages/dom/src/client.ts"),
			"@mreact/dom": path.resolve(__dirname, "packages/dom/src/index.ts"),
			"@mreact/server": path.resolve(__dirname, "packages/server/src/index.ts"),
			"@mreact/tsx": path.resolve(__dirname, "packages/tsx/src/index.ts"),
		},
	},
});
