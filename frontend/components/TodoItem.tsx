import React, { useState, useEffect, useRef } from "react";
import { Check, RotateCcw, X } from "lucide-react";

interface TodoItemProps {
  todo: any;
  categories: string[];
  editingCategory: string | null;
  setEditingCategory: (id: string | null) => void;
  handleUpdateCategory: (id: string, category: string) => void;
  handleUpdatePriority: (id: string, priority: string) => void;
  handleCompleteTodo: (id: string) => void;
  handleDeleteTodo: (id: string) => void;
  isCollaborative: boolean;
  onEdit: (todo: any) => void;
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
  isCollaborative,
  onEdit,
}: TodoItemProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    setShouldAnimate(true);
  }, []);

  // Cleanup: Remove any lingering focus when component unmounts (mobile fix)
  // Only blur if the focused element is inside this todo item, not a global input like the search bar
  useEffect(() => {
    return () => {
      if (
        containerRef.current?.contains(document.activeElement) &&
        document.activeElement instanceof HTMLElement
      ) {
        document.activeElement.blur();
      }
    };
  }, []);

  const handleCompleteClick = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    // Blur the button to prevent focus state from persisting on mobile
    e.currentTarget.blur();
    // Also blur any active element to prevent focus transfer
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsCompleting(true);
    // Brief delay to show completion state
    setTimeout(() => {
      handleCompleteTodo(todo._id);
    }, 300);
  };

  const handleDeleteClick = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    // Blur the button to prevent focus state from persisting on mobile
    e.currentTarget.blur();
    // Also blur any active element to prevent focus transfer
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsDeleting(true);
    // Brief delay for fade out animation
    setTimeout(() => {
      handleDeleteTodo(todo._id);
    }, 300);
  };


  return (
    <div
      ref={containerRef}
      key={todo._id}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(todo);
      }}
      onTouchStart={() => {
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
          longPressTriggeredRef.current = true;
          onEdit(todo);
        }, 500);
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
      className={`p-4 border rounded-xl transition-all duration-300 ease-in-out ${
        shouldAnimate ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-2'
      } ${
        isDeleting
          ? "opacity-0 transform scale-95 bg-red-900/20 border-red-800"
          : isCompleting
          ? "bg-green-900/30 border-green-600 text-green-200 transform scale-[1.02]"
          : todo.completed
          ? "bg-black border-gray-900 text-gray-500"
          : "bg-gray-900 text-gray-100 border-gray-800"
      } shadow-lg`}
    >
      <div className="flex justify-between items-center">
        <div className="flex-1">
          <p className={`text-base transition-all duration-200 ${
            isDeleting ? "opacity-50" : ""
          }`}>
            {todo.link ? (
              <a
                href={todo.link}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                onClick={(e) => e.stopPropagation()}
              >
                {todo.text}
              </a>
            ) : (
              todo.text
            )}
          </p>
        </div>

        <div className="flex items-center space-x-2 ml-3" onTouchStart={(e) => e.stopPropagation()}>
          {!todo.completed ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleCompleteClick(e); }}
              disabled={isCompleting}
              className={`text-lg w-11 h-11 flex items-center justify-center rounded-lg transition-all duration-200 ${
                isCompleting
                  ? "text-green-200 bg-green-900/40 scale-110"
                  : "text-green-400 hover:text-green-300 hover:bg-green-900/20"
              }`}
              aria-label="Mark task as complete"
            >
              <Check className="w-6 h-6" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleCompleteClick(e); }}
              className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20 text-lg w-11 h-11 flex items-center justify-center rounded-lg transition-colors"
              aria-label="Mark task as incomplete"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteClick(e); }}
            disabled={isDeleting}
            className={`text-lg w-11 h-11 flex items-center justify-center rounded-lg transition-all duration-200 ${
              isDeleting
                ? "text-red-200 bg-red-900/40 scale-110"
                : "text-red-400 hover:text-red-300 hover:bg-red-900/20"
            }`}
            aria-label="Delete task"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2 text-sm" onTouchStart={(e) => e.stopPropagation()}>
        {editingCategory === todo._id ? (
          <select
            value={todo.category}
            onChange={(e) => handleUpdateCategory(todo._id, e.target.value)}
            onBlur={() => setEditingCategory(null)}
            className="px-3 py-1.5 rounded-lg bg-black text-white border border-gray-700 text-sm focus:border-accent focus:outline-none"
            autoFocus
            onClick={(e) => { (e.target as HTMLSelectElement).focus(); e.stopPropagation(); }}
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
            onClick={(e) => e.stopPropagation()}
            className={`px-3 py-1.5 rounded-lg cursor-pointer text-sm appearance-none transition-colors ${
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
          onClick={(e) => e.stopPropagation()}
          className={`px-3 py-1.5 rounded-lg cursor-pointer text-sm appearance-none min-w-16 transition-colors ${
            todo.completed ? "bg-black border border-gray-800 text-gray-500" : "bg-black border border-gray-700 text-gray-200 hover:border-gray-600"
          }`}
        >
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        {todo.dueDate && (
          <span className={`text-sm ${todo.completed ? "text-gray-500" : "text-gray-300"}`}>
            Due: {(() => {
              const dueDate = new Date(`${todo.dueDate}T00:00:00`);
              const today = new Date();
              const tomorrow = new Date(today);
              tomorrow.setDate(today.getDate() + 1);

              // Reset times to midnight for comparison
              const dueDateMidnight = new Date(dueDate);
              dueDateMidnight.setHours(0, 0, 0, 0);
              const todayMidnight = new Date(today);
              todayMidnight.setHours(0, 0, 0, 0);
              const tomorrowMidnight = new Date(tomorrow);
              tomorrowMidnight.setHours(0, 0, 0, 0);

              // Calculate days difference
              const diffTime =
                dueDateMidnight.getTime() - todayMidnight.getTime();
              const diffDays = Math.ceil(
                diffTime / (1000 * 60 * 60 * 24)
              );

              if (diffDays === 0) {
                return "Today";
              } else if (diffDays === 1) {
                return "Tomorrow";
              } else if (diffDays === -1) {
                return "Yesterday";
              } else if (diffDays < -1) {
                return `${Math.abs(diffDays)} days ago`;
              } else if (diffDays > 1 && diffDays <= 7) {
                // Day of the week for upcoming dates within a week
                return dueDate.toLocaleDateString('en-US', { weekday: 'long' });
              } else if (dueDate.getFullYear() === today.getFullYear()) {
                // Same year, omit year
                return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              } else {
                // Different year, include year
                return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              }
            })()}
          </span>
        )}
        {isCollaborative && todo.first_name && (
          <span className={`text-sm ${todo.completed ? "text-gray-500" : "text-gray-300"}`}>
            Added by: {todo.first_name}
          </span>
        )}
      </div>
    </div>
  );
}
