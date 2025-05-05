import React, { useState, useEffect } from "react";

/**
 * AI-Todo main component
 * Fetches classification from /api/classify
 */
export default function AIToDoListApp() {
  const [tasks, setTasks] = useState([]);
  const [draft, setDraft] = useState("");
  const [newCat, setNewCat] = useState("");
  const [categories, setCategories] = useState([
    "Shopping",
    "Work",
    "Personal",
    "Finance",
    "General",
  ]);
  const [activeCat, setActiveCat] = useState(categories[0]);
  const [message, setMessage] = useState("");

  async function classify(text) {
    try {
      const res = await fetch('http://localhost:8000/classify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          text,
          categories: categories
        }),
      });
      
      if (!res.ok) {
        console.error('Classification failed:', res.status, res.statusText);
        return { category: 'General', priority: 'Low' };
      }
      
      const data = await res.json();
      return data;
    } catch (error) {
      console.error('Error during classification:', error);
      return { category: 'General', priority: 'Low' };
    }
  }

  async function addTask() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const { category, priority } = await classify(trimmed);
    if (!categories.includes(category)) setCategories(prev => [...prev, category]);
    const newTask = { id: Date.now().toString(), text: trimmed, category, priority, dateAdded: new Date().toLocaleDateString() };
    setTasks(prev => [...prev, newTask]);
    setDraft("");
    setActiveCat(category);
    setMessage(`Added "${trimmed}" to ${category}`);
  }

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(t);
  }, [message]);

  function addCategory() {
    const name = newCat.trim();
    if (!name || categories.includes(name)) return;
    setCategories(prev => [...prev, name]);
    setActiveCat(name);
    setNewCat("");
  }

  function updateTask(id, key, value) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [key]: value } : t));
  }

  const priorityOrder = { High: 0, Medium: 1, Low: 2 };
  function tasksFor(cat) {
    return tasks.filter(t => t.category === cat).sort((a,b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl mb-4">AI Todo List</h1>
      
      <div className="mb-4">
        <input
          type="text"
          placeholder="Add a task..."
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          className="w-full p-2 border rounded"
        />
      </div>

      {message && <p className="text-green-600 mb-4">{message}</p>}

      <div className="flex gap-8">
        <div className="w-48">
          <h2 className="text-lg mb-2">Categories</h2>
          <ul className="space-y-1">
            {categories.map(cat => (
              <li key={cat}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); setActiveCat(cat); }}
                  className={`block p-1 ${cat === activeCat ? 'font-bold' : ''}`}
                >
                  {cat}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <input
              type="text"
              placeholder="New category"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        <div className="flex-1">
          <h2 className="text-lg mb-2">{activeCat}</h2>
          <ul className="space-y-2">
            {tasksFor(activeCat).map(task => (
              <li key={task.id} className="flex items-start gap-2">
                <input
                  type="text"
                  value={task.text}
                  onChange={e => updateTask(task.id, 'text', e.target.value)}
                  className="flex-1 p-2 border rounded"
                />
                <span className="text-sm text-gray-500">({task.priority})</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
} 