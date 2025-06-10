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
      className={`p-4 border rounded-xl ${
        todo.completed
          ? "bg-black border-gray-900 text-gray-500"
          : "bg-gray-900 text-gray-100 border-gray-800"
      } shadow-lg`}
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
              className="text-green-400 hover:text-green-300 hover:bg-green-900/20 text-lg w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            >
              ✓
            </button>
          ) : (
            <button
              onClick={() => handleCompleteTodo(todo._id)}
              className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20 text-lg w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            >
              ↻
            </button>
          )}
          <button
            onClick={() => handleDeleteTodo(todo._id)}
            className="text-red-400 hover:text-red-300 hover:bg-red-900/20 text-lg w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
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
            className="px-3 py-1.5 rounded-lg bg-black text-white border border-gray-700 text-xs focus:border-blue-500 focus:outline-none"
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
            className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs appearance-none transition-colors ${
              todo.completed ? "bg-black border border-gray-800 text-gray-500" : "bg-black border border-gray-700 text-gray-200 hover:border-gray-600"
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
          className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs appearance-none min-w-16 transition-colors ${
            todo.completed ? "bg-black border border-gray-800 text-gray-500" : "bg-black border border-gray-700 text-gray-200 hover:border-gray-600"
          }`}
        >
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        {todo.dueDate && (
          <span className={`text-xs px-2 py-1 rounded-md ${todo.completed ? "text-gray-500 bg-gray-900" : "text-gray-300 bg-gray-800"}`}>
            Due: {new Date(`${todo.dueDate}T00:00:00`).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
