import React, { useState, useEffect } from "react";

/**
 * AI-Todo main component
 * Fetches classification from /api/classify
 */
export default function AIToDoListApp() {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newCat, setNewCat] = useState("");
  const [activeCat, setActiveCat] = useState("All");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  // Debug logging
  console.log('API_URL:', API_URL);
  console.log('Environment:', process.env.NEXT_PUBLIC_API_URL);

  // Fetch categories from MongoDB
  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_URL}/categories`);
      if (!response.ok) {
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
      const response = await fetch(`${API_URL}/todos`);
      if (!response.ok) {
        throw new Error('Failed to fetch todos');
      }
      const data = await response.json();
      setTodos(data);
    } catch (err) {
      setError('Error loading todos: ' + err.message);
    }
  };

  // Load todos and categories on component mount
  useEffect(() => {
    fetchTodos();
    fetchCategories();
  }, []);

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
      const response = await fetch(`${API_URL}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to add category');
      }

      // Refresh categories
      await fetchCategories();
      setNewCat("");
      setError('');
    } catch (err) {
      setError('Error adding category: ' + err.message);
    }
  };

  // Delete category
  const handleDeleteCategory = async (name) => {
    try {
      const response = await fetch(`${API_URL}/categories/${encodeURIComponent(name)}`, {
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
        dateAdded: new Date().toISOString().split('T')[0],
        completed: false
      };

      // Save to MongoDB with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${API_URL}/todos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      const response = await fetch(`${API_URL}/todos/${id}`, {
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

      const response = await fetch(`${API_URL}/todos/${id}/complete`, {
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

  // Filter todos by category
  const filteredTodos = activeCat === "All" 
    ? todos
    : todos.filter(todo => todo.category === activeCat);

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">AI Todo List</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-8">
        {/* Category Sidebar */}
        <div className="w-64">
          <h2 className="text-xl font-semibold mb-4">Categories</h2>
          <ul className="space-y-2 mb-4">
            <li>
              <button
                onClick={() => setActiveCat("All")}
                className={`w-full text-left px-3 py-2 rounded ${
                  activeCat === "All"
                    ? "bg-blue-500 text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                All
              </button>
            </li>
            {categories.map(cat => (
              <li key={cat} className="flex items-center">
                <button
                  onClick={() => setActiveCat(cat)}
                  className={`flex-grow text-left px-3 py-2 rounded ${
                    cat === activeCat
                      ? "bg-blue-500 text-white"
                      : "hover:bg-gray-100"
                  }`}
                >
                  {cat}
                </button>
                <button
                  onClick={() => handleDeleteCategory(cat)}
                  className="ml-2 text-red-600 hover:text-red-800"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          
          <div className="mt-4">
            <input
              type="text"
              placeholder="New category"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAddCategory()}
              className="w-full p-2 border rounded mb-2"
            />
            <button
              onClick={handleAddCategory}
              className="w-full bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Add Category
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <div className="mb-6">
            <input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add a new task..."
              className="w-full p-2 border rounded"
              onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
            />
            <button
              onClick={handleAddTodo}
              disabled={loading}
              className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-blue-300"
            >
              {loading ? 'Adding...' : 'Add Task'}
            </button>
          </div>

          <div className="space-y-4">
            {filteredTodos.map((todo) => (
              <div
                key={todo._id}
                className={`p-4 border rounded ${
                  todo.completed ? 'bg-gray-100' : 'bg-white'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className={`text-lg ${todo.completed ? 'line-through' : ''}`}>
                      {todo.text}
                    </p>
                    <div className="text-sm text-gray-600 mt-1">
                      <span className="mr-2">Category: {todo.category}</span>
                      <span>Priority: {todo.priority}</span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {!todo.completed && (
                      <button
                        onClick={() => handleCompleteTodo(todo._id)}
                        className="text-green-600 hover:text-green-800"
                      >
                        Complete
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTodo(todo._id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}