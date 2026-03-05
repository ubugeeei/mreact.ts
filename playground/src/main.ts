/**
 * MReact.ts Browser Playground
 *
 * Demonstrates declarative UI in the browser using mreact.ts.
 */

import { h } from "@mreact/core";
import { createRoot } from "@mreact/dom/client";
import { App } from "./app.tsx";

const root = createRoot(document.getElementById("app")!);
root.render(h(App, {}));
