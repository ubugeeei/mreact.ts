/**
 * useContext example — demonstrates context subscription.
 *
 * useContext subscribes to a context provider. When no provider
 * is found in the ancestor tree, the default value is used.
 */

import { useContext, createContext, h, text } from "@mreact/core";
import type { Context } from "@mreact/core";
import type { FC } from "@mreact/dom";

// ============================================================================
// Theme type and context
// ============================================================================

interface Theme {
	name: string;
	background: string;
	foreground: string;
}

export const themeCtx: Context<Theme> = createContext<Theme>({
	name: "light",
	background: "#ffffff",
	foreground: "#000000",
});

// ============================================================================
// Component
// ============================================================================

export const UseContextApp: FC = function* () {
	const theme = yield* useContext(themeCtx);

	return (
		<div style={`background:${theme.background};color:${theme.foreground}`}>
			<h1>{text("useContext Demo")}</h1>
			<p>{text(`Current theme: ${theme.name}`)}</p>
			<p>{text(`Background: ${theme.background}`)}</p>
			<p>{text(`Foreground: ${theme.foreground}`)}</p>
		</div>
	);
};
