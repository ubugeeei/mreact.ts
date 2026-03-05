/**
 * MReact.ts — Demo runner.
 *
 * u_s = commit . reconcile . render(s)
 * Algebraic effects via generators + yield
 */

import { Counter } from "./counter.tsx";
import { TodoApp } from "./todo-app.tsx";
import { SuspenseDemo } from "./suspense-demo.tsx";
import { DeferredApp } from "./deferred-value.tsx";
import { UseRefApp } from "./use-ref.tsx";
import { UseCallbackApp } from "./use-callback.tsx";
import { UseContextApp } from "./use-context.tsx";
import { UseIdApp } from "./use-id.tsx";
import { UseMemoApp } from "./use-memo.tsx";
import { UseTransitionApp } from "./use-transition.tsx";
import { h } from "@mreact/core";
import { mount, renderToString } from "@mreact/core";
import { createLoggingCommit, type CommitLog } from "@mreact/core";

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const cyan = "\x1b[36m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const magenta = "\x1b[35m";
const blue = "\x1b[34m";

const runDemo = (label: string, color: string, num: number, component: Parameters<typeof h>[0]) => {
	console.log(`${bold}${color}  [${num}] ${label}${reset}`);
	const log: CommitLog = [];
	mount(h(component, {}), null, createLoggingCommit(log));
	console.log(`  Initial render: ${log.length} commits`);
	for (const entry of log) {
		console.log(`    ${green}${entry.type}${reset} ${dim}${entry.fiberTag}${reset} ${entry.fiberType ?? ""}`);
	}
	console.log();
};

const main = () => {
	console.log();
	console.log(`${bold}  MReact.ts${reset}  ${dim}Monadic React Runtime Demo${reset}`);
	console.log(`${dim}  u_s = commit . reconcile . render(s)${reset}`);
	console.log(`${dim}  Algebraic effects via generators + yield${reset}`);
	console.log();

	runDemo("Counter", cyan, 1, Counter);

	// SSR
	console.log(`${bold}${magenta}  [2] SSR (renderToString)${reset}`);
	const html = renderToString(h(Counter, {}));
	console.log(`  ${dim}${html}${reset}`);
	console.log();

	runDemo("Todo App", yellow, 3, TodoApp);
	runDemo("Suspense Demo", cyan, 4, SuspenseDemo);
	runDemo("Deferred Value", green, 5, DeferredApp);
	runDemo("useRef Demo", blue, 6, UseRefApp);
	runDemo("useCallback Demo", magenta, 7, UseCallbackApp);
	runDemo("useContext Demo", cyan, 8, UseContextApp);
	runDemo("useId Demo", yellow, 9, UseIdApp);
	runDemo("useMemo Demo", green, 10, UseMemoApp);
	runDemo("useTransition Demo", blue, 11, UseTransitionApp);

	console.log(`${bold}${green}  u_s . u_s = u_s  QED${reset}`);
	console.log();
};

main();
