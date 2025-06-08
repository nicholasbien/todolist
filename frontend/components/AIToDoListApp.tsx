import React, { useState, useEffect, useCallback } from "react";

interface Props {
  user: any;
  token: string;
}

/**
 * AI-Todo main component
 * Backend classifies tasks automatically when creating todos
 */
export default function AIToDoListApp({ user, token }: Props) {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newCat, setNewCat] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [emailTime, setEmailTime] = useState('09:00');
  const [savingSchedule, setSavingSchedule] = useState(false);



  // Helper function for authenticated requests
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!token) return;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      throw new Error('Authentication expired');
    }

    return response;
  }, [token]);

  // Fetch categories from MongoDB
  const fetchCategories = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/categories');
      if (!response?.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      setCategories(data);
    } catch (err) {
      setError('Error loading categories: ' + err.message);
    }
  }, [authenticatedFetch]);

  // Fetch todos from MongoDB
  const fetchTodos = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/todos');
      if (!response?.ok) {
        throw new Error('Failed to fetch todos');
      }
      const data = await response.json();
      setTodos(data);
    } catch (err) {
      setError('Error loading todos: ' + err.message);
    }
  }, [authenticatedFetch]);


  // Load todos and categories when token is available
  useEffect(() => {
    if (token && user) {
      fetchTodos();
      fetchCategories();

      // Send auth info to service worker for offline sync
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_AUTH',
          token: token,
          userId: user.id || user._id || user.email
        });
      }

    }
  }, [token, user, fetchTodos, fetchCategories]);

  // Update email time when user info loads
  useEffect(() => {
    if (user) {
      const h = String(user.summary_hour ?? 9).padStart(2, '0');
      const m = String(user.summary_minute ?? 0).padStart(2, '0');
      setEmailTime(`${h}:${m}`);
    }
  }, [user]);

  // Service worker update detection
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          registration.update();

          registration.onupdatefound = () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.onstatechange = () => {
                if (
                  newWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  setShowUpdatePrompt(true);
                }
              };
            }
          };
        }
      });
    }
  }, []);

  // Function to handle app update
  const handleUpdate = () => {
    window.location.reload();
  };

  // Function to check if text is a URL
  const isUrl = (text) => {
    return text.trim().startsWith('http://') || text.trim().startsWith('https://');
  };

  // Add new category
  const handleAddCategory = async () => {
    const name = newCat.trim();
    if (!name) return;

    try {
      const response = await authenticatedFetch('/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to add category');
      }

      // Refresh categories
      await fetchCategories();
      setNewCat("");
      setShowAddCategory(false);
      setError('');
    } catch (err) {
      setError('Error adding category: ' + err.message);
    }
  };

  // Delete category
  const handleDeleteCategory = async (name) => {
    try {
      const response = await authenticatedFetch(`/categories/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete category');
      }

      // Reset active category if it was deleted
      if (activeCat === name) {
        setActiveCat("All");
      }

      // Refresh categories
      await fetchCategories();
      setError('');
    } catch (err) {
      setError('Error deleting category: ' + err.message);
    }
  };

  // Add new todo
  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Create new todo object; backend will classify and set category/priority
      const todo: any = {
        text: newTodo,
        dateAdded: new Date().toISOString(),
        completed: false
      };

      // Store link if it's a URL so backend can fetch title
      if (isUrl(newTodo)) {
        todo.link = newTodo;
      }

      // Save to MongoDB with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await authenticatedFetch('/todos', {
        method: 'POST',
        body: JSON.stringify(todo),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save todo');
      }

      // Refresh todos list
      await fetchTodos();
      setNewTodo('');
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError('Error adding todo: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Delete todo
  const handleDeleteTodo = async (id) => {
    try {
      // Validate ID
      if (!id || id === "None" || id === "undefined") {
        setError('Invalid todo ID');
        return;
      }

      const response = await authenticatedFetch(`/todos/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete todo');
      }

      // Refresh todos list
      await fetchTodos();
      setError(''); // Clear any existing errors on success
    } catch (err) {
      setError('Error deleting todo: ' + err.message);
    }
  };

  // Mark todo as complete
  const handleCompleteTodo = async (id) => {
    try {
      // Validate ID
      if (!id || id === "None" || id === "undefined") {
        setError('Invalid todo ID');
        return;
      }

      const response = await authenticatedFetch(`/todos/${id}/complete`, {
        method: 'PUT',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update todo');
      }

      // Refresh todos list
      await fetchTodos();
      setError(''); // Clear any existing errors on success
    } catch (err) {
      setError('Error updating todo: ' + err.message);
    }
  };

  // Update todo category
  const handleUpdateCategory = async (todoId, newCategory) => {
    try {
      const response = await authenticatedFetch(`/todos/${todoId}`, {
        method: 'PUT',
        body: JSON.stringify({ category: newCategory }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update category');
      }

      // Refresh todos list
      await fetchTodos();
      setEditingCategory(null);
      setError('');
    } catch (err) {
      setError('Error updating category: ' + err.message);
    }
  };

  // Update todo priority
  const handleUpdatePriority = async (todoId, newPriority) => {
    try {
      const response = await authenticatedFetch(`/todos/${todoId}`, {
        method: 'PUT',
        body: JSON.stringify({ priority: newPriority }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update priority');
      }

      // Refresh todos list
      await fetchTodos();
      setError('');
    } catch (err) {
      setError('Error updating priority: ' + err.message);
    }
  };

  // Send email summary
  const handleSendEmailSummary = async () => {
    try {
      setSendingEmail(true);
      setError('');

      const response = await authenticatedFetch('/email/send-summary', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to send email summary');
      }

      const result = await response.json();
      setError(''); // Clear any errors
      // Could add a success message state if you want
      console.log('Email summary sent successfully:', result);
    } catch (err) {
      setError('Error sending email summary: ' + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleUpdateSchedule = async () => {
    try {
      setSavingSchedule(true);
      const [hour, minute] = emailTime.split(':').map((v) => parseInt(v, 10));
      const response = await authenticatedFetch('/email/update-schedule', {
        method: 'POST',
        body: JSON.stringify({ hour, minute }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update schedule');
      }

      setShowEmailSettings(false);
      setError('');
    } catch (err) {
      setError('Error updating schedule: ' + err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  // Filter and sort todos by category
  const allFilteredTodos = (activeCat === "All"
    ? todos
    : todos.filter(todo => todo.category === activeCat));

  // Separate completed and uncompleted todos
  const uncompletedTodos = allFilteredTodos
    .filter(todo => !todo.completed)
    .sort((a, b) => {
      // First sort by priority (High > Medium > Low)
      const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Then sort by date (most recent first)
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });

  const completedTodos = allFilteredTodos
    .filter(todo => todo.completed)
    .sort((a, b) => {
      // Sort completed todos by completion date (most recent first)
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });

  // Combine todos: uncompleted first, then completed (if showing)
  const filteredTodos = showCompleted
    ? [...uncompletedTodos, ...completedTodos]
    : uncompletedTodos;

  return (
    <div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}


      {showUpdatePrompt && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4 flex justify-between items-center">
          <span>🔄 A new version is available!</span>
          <div className="space-x-2">
            <button
              onClick={handleUpdate}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
            >
              Update Now
            </button>
            <button
              onClick={() => setShowUpdatePrompt(false)}
              className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-400"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Add new todo */}
      <div className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Add a new task..."
            className="flex-1 p-3 border border-gray-700 rounded bg-gray-800 text-white placeholder-gray-400"
            onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
          />
          <button
            onClick={handleAddTodo}
            disabled={loading}
            className="bg-blue-500 text-white w-12 h-12 rounded hover:bg-blue-600 disabled:bg-blue-300 flex items-center justify-center"
          >
            {loading ? '...' : '+'}
          </button>
        </div>
      </div>

      {/* Categories - Horizontal wrapping pills */}
      <div className="mb-6">
        <div className="flex items-center mb-3">
          <h2 className="text-lg font-semibold">{activeCat}</h2>
          {activeCat !== "All" && (
            <button
              onClick={() => handleDeleteCategory(activeCat)}
              className="ml-2 text-red-600 hover:text-red-800 text-lg"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setActiveCat("All")}
            className={`px-4 py-2 rounded-full text-base ${
              activeCat === "All"
                ? "bg-blue-500 text-white"
                : "bg-gray-700 text-white hover:bg-gray-600"
            }`}
          >
            All
          </button>
          {categories
            .sort((a, b) => {
              const aName = typeof a === 'string' ? a : a.name;
              const bName = typeof b === 'string' ? b : b.name;
              if (aName === "General") return -1;
              if (bName === "General") return 1;
              return aName.localeCompare(bName);
            })
            .map(cat => {
              const catName = typeof cat === 'string' ? cat : cat.name;
              return (
            <button
              key={catName}
              onClick={() => setActiveCat(catName)}
              className={`px-4 py-2 rounded-full text-base ${
                catName === activeCat
                  ? "bg-blue-500 text-white"
                  : "bg-gray-700 text-white hover:bg-gray-600"
              }`}
            >
              {catName}
            </button>
              );
            })}
          <button
            onClick={() => setShowAddCategory(!showAddCategory)}
            className="px-4 py-2 rounded-full text-base bg-gray-700 text-white hover:bg-gray-600"
          >
            +
          </button>
        </div>

        {/* Add category input - expandable */}
        {showAddCategory && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              placeholder="New category"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAddCategory()}
              className="flex-1 p-2 border border-gray-700 rounded text-sm bg-gray-800 text-white placeholder-gray-400"
              autoFocus
            />
            <button
              onClick={handleAddCategory}
              className="bg-gray-500 text-white px-3 py-2 rounded hover:bg-gray-600 text-sm"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddCategory(false);
                setNewCat("");
              }}
              className="bg-gray-300 text-gray-700 px-3 py-2 rounded hover:bg-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Todo list */}
      <div className="space-y-3">
        {filteredTodos.map((todo) => (
          <div
            key={todo._id}
            className={`p-4 border rounded-lg ${
              todo.completed ? 'bg-gray-800 border-gray-800 text-gray-400' : 'bg-gray-700 text-white border-gray-700'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className={`text-base ${todo.completed ? 'line-through' : ''}`}>
                  {todo.link ? (
                    <a href={todo.link} target="_blank" rel="noopener noreferrer" className="underline">
                      {todo.text}
                    </a>
                  ) : (
                    todo.text
                  )}
                </p>
                <div className="text-xs mt-1">
                  {editingCategory === todo._id ? (
                    <select
                      value={todo.category}
                      onChange={(e) => handleUpdateCategory(todo._id, e.target.value)}
                      onBlur={() => setEditingCategory(null)}
                      className="px-2 py-1 rounded mr-2 bg-gray-800 text-white border border-gray-600 text-xs"
                      autoFocus
                      onClick={(e) => (e.target as HTMLSelectElement).focus()}
                    >
                      {categories
                        .sort((a, b) => {
                          if (a === "General") return -1;
                          if (b === "General") return 1;
                          return a.localeCompare(b);
                        })
                        .map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={todo.category}
                      onChange={(e) => handleUpdateCategory(todo._id, e.target.value)}
                      className={`px-2 py-1 rounded mr-2 cursor-pointer text-xs appearance-none ${todo.completed ? 'bg-gray-700 text-gray-500' : 'bg-gray-600 text-gray-200'}`}
                    >
                      {categories
                        .sort((a, b) => {
                          if (a === "General") return -1;
                          if (b === "General") return 1;
                          return a.localeCompare(b);
                        })
                        .map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  )}
                  <select
                    value={todo.priority}
                    onChange={(e) => handleUpdatePriority(todo._id, e.target.value)}
                    className={`px-2 py-1 rounded mr-2 cursor-pointer text-xs appearance-none min-w-16 ${todo.completed ? 'bg-gray-700 text-gray-500' : 'bg-gray-600 text-gray-200'}`}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  {todo.dueDate && (
                    <span className={`text-xs ${todo.completed ? 'text-gray-500' : 'text-gray-400'}`}>
                      Due: {new Date(todo.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex space-x-2 ml-3">
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
          </div>
        ))}
      </div>

      {/* Show/Hide Completed Toggle Button */}
      {completedTodos.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {showCompleted ? 'Hide Completed' : 'Show Completed'} ({completedTodos.length})
          </button>
        </div>
      )}

      {/* Email Settings Button */}
      <div className="mt-8 flex justify-center relative">
        <button
          onClick={() => setShowEmailSettings(!showEmailSettings)}
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg mr-4"
        >
          Email Settings
        </button>
        {showEmailSettings && (
          <div className="absolute bg-gray-800 border border-gray-600 rounded p-4 mt-12 w-60 text-white space-y-2">
            <label className="block text-sm">Daily Summary Time</label>
            <input
              type="time"
              value={emailTime}
              onChange={(e) => setEmailTime(e.target.value)}
              className="w-full bg-gray-700 p-1 rounded"
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                onClick={handleUpdateSchedule}
                disabled={savingSchedule}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 px-3 py-1 rounded"
              >
                {savingSchedule ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setShowEmailSettings(false)}
                className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded"
              >
                Close
              </button>
            </div>
          </div>
        )}
        <button
          onClick={handleSendEmailSummary}
          disabled={sendingEmail}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
        >
          {sendingEmail ? (
            <>
              <span className="animate-spin">⏳</span>
              <span>Sending Summary...</span>
            </>
          ) : (
            <>
              <span>📧</span>
              <span>Send Email Summary</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
