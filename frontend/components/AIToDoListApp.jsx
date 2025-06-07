import React, { useState, useEffect } from "react";

/**
 * AI-Todo main component
 * Fetches classification from /api/classify
 */
export default function AIToDoListApp({ user, token }) {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newCat, setNewCat] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  // Debug logging
  // console.log('API_URL:', API_URL);
  // console.log('Environment:', process.env.NEXT_PUBLIC_API_URL);


  // Helper function for authenticated requests
  const authenticatedFetch = async (url, options = {}) => {
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
  };

  // Fetch categories from MongoDB
  const fetchCategories = async () => {
    try {
      const response = await authenticatedFetch(`${API_URL}/categories`);
      if (!response?.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      setCategories(data);
    } catch (err) {
      setError('Error loading categories: ' + err.message);
    }
  };

  // Fetch todos from MongoDB
  const fetchTodos = async () => {
    try {
      const response = await authenticatedFetch(`${API_URL}/todos`);
      if (!response?.ok) {
        throw new Error('Failed to fetch todos');
      }
      const data = await response.json();
      setTodos(data);
    } catch (err) {
      setError('Error loading todos: ' + err.message);
    }
  };

  // Load todos and categories when token is available
  useEffect(() => {
    if (token) {
      fetchTodos();
      fetchCategories();
    }
  }, [token]);

  // Classify task using AI
  async function classify(text) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.log('Classification request timed out after 5 seconds');
      }, 5000); // Reduced to 5 seconds to match backend timeout

      const res = await fetch(`${API_URL}/classify`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          text,
          categories: categories
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        console.error('Classification failed:', res.status, res.statusText);
        throw new Error(`Classification failed with status ${res.status}`);
      }
      
      const data = await res.json();
      return data;
    } catch (error) {
      console.error('Error during classification:', error.name, error.message);
      if (error.name === 'AbortError') {
        console.log('Request was aborted due to timeout');
      }
      return { category: 'General', priority: 'Low' };
    }
  }

  // Add new category
  const handleAddCategory = async () => {
    const name = newCat.trim();
    if (!name) return;

    try {
      const response = await authenticatedFetch(`${API_URL}/categories`, {
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
      const response = await authenticatedFetch(`${API_URL}/categories/${encodeURIComponent(name)}`, {
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
      // Get AI classification
      const { category, priority } = await classify(newTodo);

      // Create new todo object
      const todo = {
        text: newTodo,
        category: category,
        priority: priority,
        dateAdded: new Date().toISOString(),
        completed: false
      };

      // Save to MongoDB with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await authenticatedFetch(`${API_URL}/todos`, {
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

      const response = await authenticatedFetch(`${API_URL}/todos/${id}`, {
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

      const response = await authenticatedFetch(`${API_URL}/todos/${id}/complete`, {
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
      const response = await authenticatedFetch(`${API_URL}/todos/${todoId}`, {
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
      const response = await authenticatedFetch(`${API_URL}/todos/${todoId}`, {
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

  // Filter and sort todos by category
  const filteredTodos = (activeCat === "All" 
    ? todos
    : todos.filter(todo => todo.category === activeCat))
    .sort((a, b) => {
      // First sort by priority (High > Medium > Low)
      const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      
      // Then sort by date (most recent first)
      return new Date(b.dateAdded) - new Date(a.dateAdded);
    });

  return (
    <div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
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
              if (a === "General") return -1;
              if (b === "General") return 1;
              return a.localeCompare(b);
            })
            .map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`px-4 py-2 rounded-full text-base ${
                cat === activeCat
                  ? "bg-blue-500 text-white"
                  : "bg-gray-700 text-white hover:bg-gray-600"
              }`}
            >
              {cat}
            </button>
          ))}
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
                  {todo.text}
                </p>
                <div className="text-xs mt-1">
                  {editingCategory === todo._id ? (
                    <select
                      value={todo.category}
                      onChange={(e) => handleUpdateCategory(todo._id, e.target.value)}
                      onBlur={() => setEditingCategory(null)}
                      className="px-2 py-1 rounded mr-2 bg-gray-800 text-white border border-gray-600 text-xs"
                      autoFocus
                      onClick={(e) => e.target.focus()}
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
                  <span className={`text-xs ${todo.completed ? 'text-gray-500' : 'text-gray-400'}`}>
                    {new Date(todo.dateAdded).toLocaleDateString()}
                  </span>
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
    </div>
  );
}