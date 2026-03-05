/**
 * Todo app — demonstrates useReducer, useRef, useMemo as algebraic effects.
 */

import { useReducer, useRef, useMemo, h, text } from "@mreact/core";
import type { MElement } from "@mreact/core";
import type { FC } from "@mreact/dom";

// ============================================================================
// Types
// ============================================================================

interface Todo {
	id: number;
	text: string;
	done: boolean;
}

type TodoAction =
	| { type: "add"; text: string }
	| { type: "toggle"; id: number }
	| { type: "remove"; id: number };

// ============================================================================
// Reducer
// ============================================================================

const todoReducer = (todos: Todo[], action: TodoAction): Todo[] => {
	switch (action.type) {
		case "add": {
			const newId =
				todos.length === 0
					? 0
					: Math.max(...todos.map((t) => t.id)) + 1;
			return [...todos, { id: newId, text: action.text, done: false }];
		}
		case "toggle":
			return todos.map((t) =>
				t.id === action.id ? { ...t, done: !t.done } : t,
			);
		case "remove":
			return todos.filter((t) => t.id !== action.id);
	}
};

// ============================================================================
// Component
// ============================================================================

export const TodoApp: FC = function* () {
	const [todos, dispatch] = yield* useReducer(todoReducer, [] as Todo[]);
	const inputRef = yield* useRef("");

	const completedCount = yield* useMemo(
		() => todos.filter((t) => t.done).length,
		[todos],
	);

	const renderTodo = (todo: Todo): MElement => (
		<li class={todo.done ? "done" : ""} onClick={(_: unknown) => dispatch({ type: "toggle", id: todo.id })}>
			<span>{text(todo.text)}</span>
			<button onClick={(_: unknown) => dispatch({ type: "remove", id: todo.id })}>x</button>
		</li>
	);

	return (
		<div class="todo-app">
			<h1>{text("Todo App")}</h1>
			<div class="todo-input">
				<input placeholder="What needs to be done?" />
				<button onClick={(_: unknown) => {
					dispatch({ type: "add", text: inputRef.current });
					inputRef.current = "";
				}}>Add</button>
			</div>
			<ul class="todo-list">
				{...todos.map(renderTodo)}
			</ul>
			<footer class="todo-footer">
				{text(`${completedCount} / ${todos.length} completed`)}
			</footer>
		</div>
	);
};
