import React from "react";

interface TodoItemProps {
  todo: any;
  categories: string[];
  editingCategory: string | null;
  setEditingCategory: (id: string | null) => void;
  handleUpdateCategory: (id: string, category: string) => void;
  handleUpdatePriority: (id: string, priority: string) => void;
  handleCompleteTodo: (id: string) => void;
  handleDeleteTodo: (id: string) => void;
}

export default function TodoItem({
  todo,
  categories,
  editingCategory,
  setEditingCategory,
  handleUpdateCategory,
  handleUpdatePriority,
  handleCompleteTodo,
  handleDeleteTodo,
}: TodoItemProps) {
  return (
    <div
      key={todo._id}
      className={`p-4 border rounded-lg ${
        todo.completed
          ? "bg-gray-800 border-gray-800 text-gray-400"
          : "bg-gray-700 text-white border-gray-700"
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className={`text-base ${todo.completed ? "line-through" : ""}`}>
            {todo.link ? (
              <a
                href={todo.link}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {todo.text}
              </a>
            ) : (
              todo.text
            )}
          </p>
        </div>

        <div className="flex items-center space-x-2 ml-3">
          {!todo.completed ? (
            <button
              onClick={() => handleCompleteTodo(todo._id)}
              className="text-green-600 hover:text-green-800 text-lg w-8 h-8 flex items-center justify-center"
            >
              ✓
            </button>
          ) : (
            <button
              onClick={() => handleCompleteTodo(todo._id)}
              className="text-yellow-600 hover:text-yellow-800 text-lg w-8 h-8 flex items-center justify-center"
            >
              ↻
            </button>
          )}
          <button
            onClick={() => handleDeleteTodo(todo._id)}
            className="text-red-600 hover:text-red-800 text-lg w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
        {editingCategory === todo._id ? (
          <select
            value={todo.category}
            onChange={(e) => handleUpdateCategory(todo._id, e.target.value)}
            onBlur={() => setEditingCategory(null)}
            className="px-2 py-1 rounded bg-gray-800 text-white border border-gray-600 text-xs"
            autoFocus
            onClick={(e) => (e.target as HTMLSelectElement).focus()}
          >
            {categories
              .sort((a, b) => {
                if (a === "General") return -1;
                if (b === "General") return 1;
                return a.localeCompare(b);
              })
              .map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
          </select>
        ) : (
          <select
            value={todo.category}
            onChange={(e) => handleUpdateCategory(todo._id, e.target.value)}
            className={`px-2 py-1 rounded cursor-pointer text-xs appearance-none ${
              todo.completed ? "bg-gray-700 text-gray-500" : "bg-gray-600 text-gray-200"
            }`}
          >
            {categories
              .sort((a, b) => {
                if (a === "General") return -1;
                if (b === "General") return 1;
                return a.localeCompare(b);
              })
              .map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
          </select>
        )}
        <select
          value={todo.priority}
          onChange={(e) => handleUpdatePriority(todo._id, e.target.value)}
          className={`px-2 py-1 rounded cursor-pointer text-xs appearance-none min-w-16 ${
            todo.completed ? "bg-gray-700 text-gray-500" : "bg-gray-600 text-gray-200"
          }`}
        >
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        {todo.dueDate && (
          <span className={`text-xs ${todo.completed ? "text-gray-500" : "text-gray-400"}`}>
            Due: {new Date(`${todo.dueDate}T00:00:00`).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
