import React, { useState, useEffect, useRef } from "react";
import { Check, RotateCcw, X, MessageCircle, Clock, User, Bot, UserCircle, ChevronDown, ChevronRight } from "lucide-react";

interface SubtaskItem {
  _id: string;
  text: string;
  completed: boolean;
  [key: string]: any;
}

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
  onChat?: (todo: any) => void;
  sessionStatus?: 'waiting' | 'unread_reply' | 'needs_human_response';
  isSubtask?: boolean;
  subtaskCount?: number;
  subtaskDoneCount?: number;
  subtasks?: SubtaskItem[];
  subtaskSessionStatuses?: Record<string, 'waiting' | 'unread_reply' | 'needs_human_response'>;
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
  onChat,
  sessionStatus,
  isSubtask,
  subtaskCount,
  subtaskDoneCount,
  subtasks,
  subtaskSessionStatuses,
}: TodoItemProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [subtasksExpanded, setSubtasksExpanded] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

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
      onClick={() => {
        onEdit(todo);
      }}
      className={`cursor-pointer p-4 border rounded-xl transition-all duration-300 ease-in-out ${
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
          <p className={`text-base transition-all duration-200 whitespace-pre-wrap break-words ${
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
          {subtaskCount != null && subtaskCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setSubtasksExpanded(!subtasksExpanded); }}
              className="flex items-center gap-1 text-xs text-gray-400 mt-1 hover:text-gray-200 transition-colors"
              aria-label={subtasksExpanded ? "Hide subtasks" : "Show subtasks"}
            >
              {subtasksExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              {subtaskDoneCount || 0}/{subtaskCount} sub-tasks done
            </button>
          )}
        </div>

        <div className="flex items-center space-x-1 ml-3" onTouchStart={(e) => e.stopPropagation()}>
          {/* Chat button */}
          {onChat && (
            <button
              onClick={(e) => { e.stopPropagation(); onChat(todo); }}
              className={`relative text-lg w-11 h-11 flex items-center justify-center rounded-lg transition-all duration-200 focus:outline-none ${
                sessionStatus === 'needs_human_response'
                  ? 'text-amber-400'
                  : sessionStatus === 'unread_reply'
                  ? 'text-accent'
                  : sessionStatus === 'waiting'
                  ? 'text-gray-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              aria-label="Chat about this task"
            >
              {sessionStatus === 'needs_human_response' ? (
                <UserCircle className="w-5 h-5" />
              ) : sessionStatus === 'waiting' ? (
                <Clock className="w-5 h-5" />
              ) : (
                <MessageCircle className="w-5 h-5" />
              )}
              {sessionStatus === 'needs_human_response' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              )}
              {sessionStatus === 'unread_reply' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full animate-pulse" />
              )}
            </button>
          )}
          {!todo.completed ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleCompleteClick(e); }}
              onMouseEnter={() => setHoveredButton('complete')}
              onMouseLeave={() => setHoveredButton(null)}
              disabled={isCompleting}
              className={`text-lg w-11 h-11 flex items-center justify-center rounded-lg transition-all duration-200 focus:outline-none ${
                isCompleting
                  ? "text-green-200 bg-green-900/40 scale-110"
                  : hoveredButton === 'complete'
                  ? "text-green-300 bg-green-900/20"
                  : "text-green-400"
              }`}
              aria-label="Mark task as complete"
            >
              <Check className="w-6 h-6" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleCompleteClick(e); }}
              onMouseEnter={() => setHoveredButton('uncomplete')}
              onMouseLeave={() => setHoveredButton(null)}
              className={`text-lg w-11 h-11 flex items-center justify-center rounded-lg transition-colors focus:outline-none ${
                hoveredButton === 'uncomplete'
                  ? "text-yellow-300 bg-yellow-900/20"
                  : "text-yellow-400"
              }`}
              aria-label="Mark task as incomplete"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteClick(e); }}
            onMouseEnter={() => setHoveredButton('delete')}
            onMouseLeave={() => setHoveredButton(null)}
            disabled={isDeleting}
            className={`text-lg w-11 h-11 flex items-center justify-center rounded-lg transition-all duration-200 focus:outline-none ${
              isDeleting
                ? "text-red-200 bg-red-900/40 scale-110"
                : hoveredButton === 'delete'
                ? "text-red-300 bg-red-900/20"
                : "text-red-400"
            }`}
            aria-label="Close task"
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
        {todo.agent_id && (
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
            todo.completed ? 'bg-blue-900/20 text-gray-500' : 'bg-blue-900/30 text-blue-300'
          }`}>
            {todo.agent_id === 'claude' ? 'Claude' : todo.agent_id === 'openclaw' ? 'OpenClaw' : todo.agent_id}
          </span>
        )}
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
        {todo.creator_type === 'agent' && (
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
            todo.completed ? 'bg-purple-900/20 text-gray-500' : 'bg-purple-900/30 text-purple-300'
          }`}>
            <Bot className="w-3 h-3" />
            AI
          </span>
        )}
        {isCollaborative && todo.first_name && (
          <span className={`text-sm ${todo.completed ? "text-gray-500" : "text-gray-300"}`}>
            Added by: {todo.first_name}
          </span>
        )}
      </div>

      {/* Subtasks rendered inside parent card */}
      {subtasksExpanded && subtasks && subtasks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5">
          {subtasks.map((st, idx) => (
            <div
              key={st._id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                st.completed
                  ? 'bg-black/40 text-gray-500'
                  : 'bg-gray-800/50 text-gray-200'
              }`}
            >
              {/* Subtask complete/uncomplete button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleCompleteTodo(st._id); }}
                className={`flex-shrink-0 w-5 h-5 rounded border transition-colors flex items-center justify-center ${
                  st.completed
                    ? 'bg-green-900/40 border-green-700 text-green-400'
                    : 'border-gray-600 hover:border-green-500 text-transparent hover:text-green-400'
                }`}
                aria-label={st.completed ? "Mark subtask incomplete" : "Mark subtask complete"}
              >
                <Check className="w-3 h-3" />
              </button>

              {/* Subtask text */}
              <span
                className={`flex-1 text-sm cursor-pointer`}
                onClick={(e) => { e.stopPropagation(); onEdit(st); }}
              >
                {st.text}
              </span>

              {/* Subtask chat button */}
              {onChat && (
                <button
                  onClick={(e) => { e.stopPropagation(); onChat(st); }}
                  className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors ${
                    subtaskSessionStatuses?.[st._id] === 'needs_human_response'
                      ? 'text-amber-400'
                      : subtaskSessionStatuses?.[st._id] === 'unread_reply'
                      ? 'text-accent'
                      : subtaskSessionStatuses?.[st._id] === 'waiting'
                      ? 'text-gray-400'
                      : 'text-gray-600 hover:text-gray-400'
                  }`}
                  aria-label="Chat about subtask"
                >
                  {subtaskSessionStatuses?.[st._id] === 'needs_human_response' ? (
                    <UserCircle className="w-3.5 h-3.5" />
                  ) : subtaskSessionStatuses?.[st._id] === 'waiting' ? (
                    <Clock className="w-3.5 h-3.5" />
                  ) : (
                    <MessageCircle className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              {/* Subtask delete */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteTodo(st._id); }}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:text-red-400 transition-colors"
                aria-label="Delete subtask"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
