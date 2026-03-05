import { useContext, createContext, h, text, type EffectOp, type MElement, type Context } from "@mreact/core";

interface Theme {
	name: string;
	background: string;
	foreground: string;
}

const themeCtx: Context<Theme> = createContext<Theme>({
	name: "dark",
	background: "#1e293b",
	foreground: "#e0e0e0",
});

export const UseContextDemo = function* (): Generator<EffectOp, MElement, unknown> {
	const theme = yield* useContext(themeCtx);

	return (
		<div style={`background:${theme.background};color:${theme.foreground};padding:1rem;border-radius:8px`}>
			<h2>useContext Demo</h2>
			<p>{text(`Current theme: ${theme.name}`)}</p>
			<p>{text(`Background: ${theme.background}`)}</p>
			<p>{text(`Foreground: ${theme.foreground}`)}</p>
		</div>
	);
};
