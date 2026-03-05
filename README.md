# mreact.ts

**Monadic React in TypeScript** — a from-scratch React implementation built on algebraic effects and indexed monads.

Components are generators. Hooks are algebraic effects. The reconciler is an effect handler.
Rules of Hooks are enforced at the type level via an Atkey-style indexed monad.

```
u_s = commit . reconcile . render(s)
```

## Core Ideas

### Algebraic Effects via Generators

In Haskell mreact, hooks are algebraic effects handled by the reconciler.
In TypeScript, `yield*` is "perform" and the reconciler loop (`gen.next(value)`) is the effect handler:

```tsx
const Counter: FC = function* () {
  const [count, setCount] = yield* useState(0);

  yield* useEffect(() => {
    console.log(`Count: ${count}`);
  }, [count]);

  return (
    <div>
      <p>{text(`Count: ${count}`)}</p>
      <button onClick={(_: unknown) => setCount(count + 1)}>+</button>
    </div>
  );
};
```

Each `yield*` suspends the generator. The reconciler intercepts the yielded `EffectOp`, reads/writes hook state in the fiber, and resumes with the result.

### Type-Level Rules of Hooks (Indexed Monad)

The `Ix<I, J, A>` type tracks hook state transitions at the type level:

- `I` = hook-state before (type-level slot list)
- `J` = hook-state after
- `A` = result value

Each hook prepends a slot: `ixUseState(0)` has type `Ix<I, [SState<number>, ...I], [number, SetState<number>]>`.

Conditional hooks are a **type error** because branches produce different `J` types:

```ts
const counter: IxFC<[SEffect, SState<number>]> = (_props) =>
  ixUseState(0)
    .bind(([count, setCount]) =>
      ixUseEffect(() => {
        console.log(`Count changed: ${count}`);
      }, [count])
        .map(() =>
          div(
            class_("counter"),
            h1({}, text(`Count: ${count}`)),
            button(onClick((_) => setCount(count + 1)), text("+")),
          ),
        ),
    );

// TYPE ERROR: conditional hook — branches produce different slot lists
// const bad: IxFC<[SState<number>]> = (_props) =>
//   ixUseState(0).bind(([count, _]) =>
//     count > 0
//       ? ixUseState(true).map(...)   // J = [SState<boolean>, SState<number>]
//       : ixPure(div({}))             // J = [SState<number>]
//   );  // ← J doesn't unify
```

### Fiber Architecture

The reconciler builds a fiber tree from `MElement` descriptions. Each `FiberNode` holds:

- Hook state (`hookStore`) — the indexed monad's runtime state
- Tree pointers (`child` / `sibling` / `return`)
- Effect tags (`placement` / `update` / `deletion`) for the commit phase
- `alternate` for double buffering (concurrent rendering)

The render pipeline: reconcile the element tree into fibers, run effects, then commit mutations to the target (browser DOM, string, or logging backend).

## Packages

| Package | Description |
|---|---|
| `@mreact/core` | Hooks, elements, fiber, reconciler, scheduler, indexed monad |
| `@mreact/dom` | HTML element DSL + browser DOM runtime (`createRoot`) |
| `@mreact/server` | Flight protocol (RSC serialization) + streaming SSR |
| `@mreact/tsx` | JSX-to-`h()` transpiler + Vite plugin |

### `@mreact/core`

The core runtime. No DOM dependency.

- **Hooks** (`hooks.ts`) — Generator-based hooks: `useState`, `useReducer`, `useRef`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useContext`, `useId`, `useTransition`, `useDeferredValue`, `use`
- **Elements** (`element.ts`) — `MElement` type and constructors: `h()`, `text()`, `fragment()`, `suspenseElement()`, `serverElement()`
- **Fiber** (`fiber.ts`) — `FiberNode` structure with hook store, tree pointers, effect tags
- **Reconciler** (`reconciler.ts`) — Effect handler that interprets generators, fiber diffing, children reconciliation
- **Scheduler** (`scheduler.ts`) — `mount()`, `performUpdate()`, `renderToString()` (SSR)
- **Commit** (`commit.ts`) — Abstract commit with pluggable backends (logging, DOM)
- **Indexed Monad** (`indexed.ts`) — `Ix<I, J, A>`, `IxFC`, `ixComponent()`, indexed hook primitives

### `@mreact/dom`

- **DSL** (`dom.ts`) — `div()`, `button()`, `class_()`, `onClick()`, etc.
- **Browser Runtime** (`client.ts`) — `createRoot(container)` with real DOM commit, event delegation

```ts
import { createRoot } from "@mreact/dom/client";

const root = createRoot(document.getElementById("app")!);
root.render(h(App, {}));
```

### `@mreact/tsx`

JSX transpiler that converts `<div class="foo">` to `h("div", { class: "foo" })`.

- `transformSource(code)` — standalone source-to-source transform
- `mreactTsx()` — Vite plugin (runs before esbuild, `enforce: "pre"`)

```ts
// vite.config.ts
import { mreactTsx } from "@mreact/tsx/vite-plugin";

export default {
  plugins: [mreactTsx()],
};
```

### `@mreact/server`

- **Flight** (`flight.ts`) — RSC serialization protocol: `renderToFlight()`, `createFlightDecoder()`
- **Streaming** (`streaming.ts`) — `renderToStream()` with shell + pending boundaries

Server Components are async functions (not generators) — they cannot use hooks:

```ts
const UserProfile: ServerFC = async (_props) => (
  <div>
    <h1>{text("Alice")}</h1>
    <p>{text("Haskell enthusiast")}</p>
  </div>
);
```

## Project Structure

```
packages/
  core/src/
    hooks.ts          # Algebraic effect operations (hook generators)
    element.ts        # MElement type and constructors
    fiber.ts          # FiberNode structure
    reconciler.ts     # Effect handler + fiber reconciliation
    scheduler.ts      # Mount, update loop, SSR
    commit.ts         # Commit phase (pluggable backends)
    indexed.ts        # Indexed monad for type-level hook safety
  dom/src/
    dom.ts            # HTML element DSL
    client.ts         # Browser DOM runtime (createRoot)
    component.ts      # FC, ServerFC type aliases
  server/src/
    flight.ts         # RSC Flight protocol
    streaming.ts      # Streaming SSR
  tsx/src/
    tsx.ts            # JSX-to-h() transpiler
    vite-plugin.ts    # Vite plugin wrapper
examples/             # Standalone examples (DSL + JSX)
playground/           # Browser playground (Vite dev server)
```

## Getting Started

```bash
pnpm install
pnpm build
```

### Run Examples (CLI)

```bash
npx tsx examples/main.tsx
```

### Run Playground (Browser)

```bash
pnpm dev
```

Opens a Vite dev server with interactive demos (counter, useRef, useMemo, useContext, etc.).

### Run Tests

```bash
pnpm test
```

## Hooks Reference

| Hook | Generator | Indexed Monad | Slot |
|---|---|---|---|
| `useState` | `yield* useState(init)` | `ixUseState(init)` | `SState<S>` |
| `useReducer` | `yield* useReducer(reducer, init)` | `ixUseReducer(reducer, init)` | `SReducer<S>` |
| `useRef` | `yield* useRef(init)` | `ixUseRef(init)` | `SRef<A>` |
| `useEffect` | `yield* useEffect(fn, deps?)` | `ixUseEffect(fn, deps?)` | `SEffect` |
| `useLayoutEffect` | `yield* useLayoutEffect(fn, deps?)` | `ixUseLayoutEffect(fn, deps?)` | `SLayoutEffect` |
| `useMemo` | `yield* useMemo(fn, deps?)` | `ixUseMemo(fn, deps?)` | `SMemo<A>` |
| `useCallback` | `yield* useCallback(fn, deps?)` | `ixUseCallback(fn, deps?)` | `SCallback<F>` |
| `useContext` | `yield* useContext(ctx)` | `ixUseContext(ctx)` | `SContext<A>` |
| `useId` | `yield* useId()` | `ixUseId()` | `SId` |
| `useTransition` | `yield* useTransition()` | `ixUseTransition()` | `STransition` |
| `useDeferredValue` | `yield* useDeferredValue(val)` | `ixUseDeferredValue(val)` | `SDeferredValue<A>` |
| `use` | `yield* use(async)` | `ixUse(async)` | *(identity)* |

`use` has identity index (`Ix<I, I, A>`) — it is safe inside conditionals and loops.

## Comparison with React

| Concept | React | mreact.ts |
|---|---|---|
| Components | Functions returning JSX | Generators yielding effect ops |
| Hooks | Runtime call-order convention | Algebraic effects via `yield*` |
| Rules of Hooks | Lint rule (eslint-plugin-react-hooks) | Type-level enforcement (`Ix<I,J,A>`) |
| Reconciler | Internal (hidden) | Effect handler (`handleEffects`) |
| Fiber | Internal (hidden) | Explicit `FiberNode` with hook store |
| Server Components | RSC protocol | `serverElement()` + Flight |
| Suspense | Built-in | `SuspendException` + boundary fibers |

## Theory

The architecture is grounded in:

- **Algebraic Effects** — Hooks as effect operations, reconciler as handler. `yield` = perform, `gen.next(value)` = handle + resume.
- **Indexed Monads** (Atkey) — `Ix<I, J, A>` tracks pre/post hook-state at the type level. `bind` composes: `Ix<I,J,A> -> (A -> Ix<J,K,B>) -> Ix<I,K,B>`.
- **Fiber Architecture** — Incremental reconciliation with child/sibling/return pointers and effect tags.
- **Idempotent Update** — `u_s . u_s = u_s`. Re-rendering with the same state produces the same fiber tree.

## License

ISC
