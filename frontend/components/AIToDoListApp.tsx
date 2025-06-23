import React, { useState, useEffect, useCallback, useRef } from "react";
import TodoItem from "./TodoItem";
import TodoChatbot from "./TodoChatbot";

interface Props {
  user: any;
  token: string;
  onLogout?: () => void;
  onShowEmailSettings?: () => void;
  showEmailSettings?: boolean;
  onCloseEmailSettings?: () => void;
}

/**
 * AI-Todo main component
 * Backend classifies tasks automatically when creating todos
 */
export default function AIToDoListApp({ user, token, onLogout, onShowEmailSettings, showEmailSettings, onCloseEmailSettings }: Props) {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [error, setError] = useState("");
  const [newCat, setNewCat] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editCatName, setEditCatName] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [emailTime, setEmailTime] = useState('09:00');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [emailInstructions, setEmailInstructions] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailSpaceIds, setEmailSpaceIds] = useState<string[]>([]);
  const [spaces, setSpaces] = useState([]);
  const [activeSpace, setActiveSpace] = useState(null);
  const [showAddSpaceModal, setShowAddSpaceModal] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [showEditSpaceModal, setShowEditSpaceModal] = useState(false);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editSpaceCollaborative, setEditSpaceCollaborative] = useState(true);
  const [inviteEmails, setInviteEmails] = useState<string[]>(['']);
  const [spaceToEdit, setSpaceToEdit] = useState<any>(null);
  const [spaceMembers, setSpaceMembers] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<string[]>([]);


  // Loading state when switching spaces
  const [spaceLoading, setSpaceLoading] = useState(false);
  const spaceFetchIdRef = useRef(0);

  // Edit todo modal state
  const [showEditTodoModal, setShowEditTodoModal] = useState(false);
  const [todoToEdit, setTodoToEdit] = useState<any>(null);
  const [editText, setEditText] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCategoryVal, setEditCategoryVal] = useState('General');
  const [editPriorityVal, setEditPriorityVal] = useState('Medium');
  const [editDueDate, setEditDueDate] = useState<string>('');

  // Track latest fetch requests to avoid race conditions when switching spaces
  const todosFetchIdRef = useRef(0);
  const categoriesFetchIdRef = useRef(0);
  const membersFetchIdRef = useRef(0);

  const handleOpenEmailSettings = async () => {
    try {
      const response = await authenticatedFetch('/auth/me');
      if (!response?.ok) throw new Error('Failed to fetch user info');
      const userData = await response.json();
      const h = String(userData?.summary_hour ?? 9).padStart(2, '0');
      const m = String(userData?.summary_minute ?? 0).padStart(2, '0');
      setEmailTime(`${h}:${m}`);
      setEmailInstructions(userData?.email_instructions ?? '');
      setEmailEnabled(userData?.email_enabled ?? false);
      setEmailSpaceIds(userData?.email_spaces ?? []);
      if (spaces.length === 0) {
        await fetchSpaces();
      }
      onShowEmailSettings?.();
      setError('');
    } catch (err) {
      setError('Error loading email settings: ' + (err.message || err));
    }
  };

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

  const fetchSpaces = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/spaces');
      if (response?.ok) {
        const data = await response.json();
        setSpaces(data);
        if (!activeSpace && data.length > 0) {
          setActiveSpace(data[0]);
        }
      }
    } catch (err) {
      console.error('Error loading spaces', err);
    }
  }, [authenticatedFetch, activeSpace]);

  const fetchMembers = useCallback(async () => {
    const fetchId = ++membersFetchIdRef.current;
    if (!activeSpace || !activeSpace._id) {
      if (fetchId === membersFetchIdRef.current) {
        setSpaceMembers([]);
        setPendingInvites([]);
      }
      return;
    }
    try {
      const resp = await authenticatedFetch(`/spaces/${activeSpace._id}/members`);
      if (resp?.ok) {
        const data = await resp.json();
        if (fetchId === membersFetchIdRef.current) {
          setSpaceMembers(data.members || []);
          setPendingInvites(data.pending_invites || []);
        }
      }
    } catch (err) {
      if (fetchId === membersFetchIdRef.current) {
        console.error('Error loading members', err);
      }
    }
  }, [authenticatedFetch, activeSpace]);

  // Fetch categories from MongoDB
  const fetchCategories = useCallback(async () => {
    const fetchId = ++categoriesFetchIdRef.current;
    try {
      const spaceId = activeSpace?._id || null;
      const url = spaceId ? `/categories?space_id=${spaceId}` : '/categories';
      const response = await authenticatedFetch(url);
      if (!response?.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      if (fetchId === categoriesFetchIdRef.current) {
        setCategories(data);
      }
    } catch (err) {
      if (fetchId === categoriesFetchIdRef.current) {
        setError('Error loading categories: ' + err.message);
      }
    }
  }, [authenticatedFetch, activeSpace]);

  // Fetch todos from MongoDB
  const fetchTodos = useCallback(async (showLoading: boolean = true) => {
    const fetchId = ++todosFetchIdRef.current;
    if (showLoading) {
      setLoadingTodos(true);
    }
    try {
      const url = activeSpace && activeSpace._id ? `/todos?space_id=${activeSpace._id}` : '/todos';
      const response = await authenticatedFetch(url);
      if (!response?.ok) {
        throw new Error('Failed to fetch todos');
      }
      const data = await response.json();
      if (fetchId === todosFetchIdRef.current) {
        setTodos(data);
      }
    } catch (err) {
      if (fetchId === todosFetchIdRef.current) {
        setError('Error loading todos: ' + err.message);
      }
    } finally {
      if (fetchId === todosFetchIdRef.current && showLoading) {
        setLoadingTodos(false);
      }
    }
  }, [authenticatedFetch, activeSpace]);

  const fetchSpaceData = useCallback(async () => {
    const fetchId = ++spaceFetchIdRef.current;
    setSpaceLoading(true);
    await Promise.all([fetchCategories(), fetchTodos(true), fetchMembers()]);
    if (fetchId === spaceFetchIdRef.current) {
      setSpaceLoading(false);
    }
  }, [fetchCategories, fetchTodos, fetchMembers]);


  // Initial load when token becomes available
  useEffect(() => {
    if (token && user) {
      fetchSpaces();

      // Send auth info to service worker for offline sync
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_AUTH',
          token: token,
          userId: user.id || user._id || user.email
        });
      }
    }
  }, [token, user, fetchSpaces]);

  // Refetch data when active space changes
  useEffect(() => {
    if (token && user) {
      // Hide current data immediately to show loading state
      setTodos([]);
      setCategories([]);
      setSpaceMembers([]);
      setPendingInvites([]);
      // Fetch new data for the active space
      fetchSpaceData();
    }
    // Reset category filter when switching spaces
    setActiveCat('All');
  }, [activeSpace, fetchSpaceData, token, user]);

  // Update email time when user info loads
  useEffect(() => {
    if (user) {
      const h = String(user.summary_hour ?? 9).padStart(2, '0');
      const m = String(user.summary_minute ?? 0).padStart(2, '0');
      setEmailTime(`${h}:${m}`);
      setEmailInstructions(user.email_instructions ?? '');
      setEmailEnabled(user.email_enabled ?? false);
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

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('Browser came back online');
      // The service worker handles sync automatically when GET /todos is called
      // Just trigger a single fetch which will handle sync + refresh internally
      if (token && user) {
        fetchTodos(false);
      }
    };

    const handleOffline = () => {
      console.log('Browser went offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token, user, fetchTodos]);

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
        body: JSON.stringify({
          name,
          space_id: activeSpace?._id || null
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to add category');
      }

      // Refresh categories
      await fetchCategories();
      setNewCat("");
      setShowAddCategoryModal(false);
      setError('');
    } catch (err) {
      setError('Error adding category: ' + err.message);
    }
  };

  const handleAddSpace = async () => {
    const spaceName = newSpaceName.trim();
    if (!spaceName) return;
    try {
      const response = await authenticatedFetch('/spaces', {
        method: 'POST',
        body: JSON.stringify({ name: spaceName })
      });
      if (response.ok) {
        await fetchSpaces();
        setShowAddSpaceModal(false);
        setNewSpaceName('');
      }
    } catch (err) {
      console.error('Error creating space', err);
    }
  };

  const handleUpdateSpace = async () => {
    if (!spaceToEdit) return;
    const trimmedName = editSpaceName.trim();
    try {
      await authenticatedFetch(`/spaces/${spaceToEdit._id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmedName || spaceToEdit.name, collaborative: editSpaceCollaborative })
      });
      const emails = inviteEmails.map(e => e.trim()).filter(e => e);
      if (emails.length) {
        await authenticatedFetch(`/spaces/${spaceToEdit._id}/invite`, {
          method: 'POST',
          body: JSON.stringify({ emails })
        });
      }
      await fetchSpaces();
    } catch (err) {
      console.error('Error updating space', err);
    } finally {
      setShowEditSpaceModal(false);
      setInviteEmails(['']);
      setSpaceToEdit(null);
    }
  };

  const handleDeleteSpace = async (id) => {
    try {
      await authenticatedFetch(`/spaces/${id}`, { method: 'DELETE' });
      await fetchSpaces();
      if (activeSpace && activeSpace._id === id) {
        const updated = spaces.filter(s => s._id !== id);
        setActiveSpace(updated.length ? updated[0] : null);
      }
    } catch (err) {
      console.error('Error deleting space', err);
    }
  };

  const handleLeaveSpace = async (id) => {
    try {
      await authenticatedFetch(`/spaces/${id}/leave`, { method: 'POST' });
      await fetchSpaces();
      if (activeSpace && activeSpace._id === id) {
        const updated = spaces.filter(s => s._id !== id);
        setActiveSpace(updated.length ? updated[0] : null);
      }
    } catch (err) {
      console.error('Error leaving space', err);
    }
  };

  // Delete category
  const handleDeleteCategory = async (name) => {
    try {
      const spaceId = activeSpace?._id || null;
      const url = spaceId ? `/categories/${encodeURIComponent(name)}?space_id=${spaceId}` : `/categories/${encodeURIComponent(name)}`;
      const response = await authenticatedFetch(url, {
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

  const handleRenameCategory = async () => {
    const trimmed = editCatName.trim();
    if (!trimmed || trimmed === activeCat) {
      setShowEditCategoryModal(false);
      return;
    }

    try {
      const spaceId = activeSpace?._id || null;
      const url = spaceId ? `/categories/${encodeURIComponent(activeCat)}?space_id=${spaceId}` : `/categories/${encodeURIComponent(activeCat)}`;
      const response = await authenticatedFetch(url, {
        method: 'PUT',
        body: JSON.stringify({ new_name: trimmed }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to rename category');
      }

      await fetchCategories();
      await fetchTodos(false);
      setActiveCat(trimmed);
      setShowEditCategoryModal(false);
      setEditCatName('');
      setError('');
    } catch (err) {
      setError('Error renaming category: ' + err.message);
    }
  };

  // Add new todo
  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Create new todo object; backend will classify and set category/priority
      // Create dateAdded in user's local timezone
      const now = new Date();
      const localDateString = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      const localTimeString = now.toLocaleTimeString('en-GB', { hour12: false }); // HH:MM:SS format
      const localISOString = `${localDateString}T${localTimeString}`;

      const todo: any = {
        text: newTodo,
        dateAdded: localISOString,
        completed: false,
        space_id: activeSpace ? activeSpace._id : null
      };

      // If a category is selected (not "All"), skip AI classification on backend
      if (activeCat !== 'All') {
        todo.category = activeCat;
        todo.priority = 'Medium';
      }

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
      await fetchTodos(false);
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
      await fetchTodos(false);
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
      await fetchTodos(false);
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
      await fetchTodos(false);
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
      await fetchTodos(false);
      setError('');
    } catch (err) {
      setError('Error updating priority: ' + err.message);
    }
  };

  const handleEditTodo = (todo) => {
    setTodoToEdit(todo);
    setEditText(todo.text);
    setEditNotes(todo.notes || '');
    setEditCategoryVal(todo.category);
    setEditPriorityVal(todo.priority);

    // Format date for HTML date input (YYYY-MM-DD)
    let formattedDate = '';
    if (todo.dueDate) {
      try {
        const date = new Date(todo.dueDate);
        // Only format if it's a valid date
        if (!isNaN(date.getTime())) {
          formattedDate = date.toISOString().split('T')[0];
        }
      } catch (e) {
        console.warn('Invalid date format:', todo.dueDate);
        formattedDate = '';
      }
    }
    setEditDueDate(formattedDate);

    setShowEditTodoModal(true);
  };

  const handleSaveTodoEdit = async () => {
    if (!todoToEdit) return;
    try {
      const updates: any = {
        text: editText,
        notes: editNotes,
        category: editCategoryVal,
        priority: editPriorityVal,
        dueDate: editDueDate || null,
      };
      const response = await authenticatedFetch(`/todos/${todoToEdit._id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update todo');
      }
      await fetchTodos(false);
      setShowEditTodoModal(false);
      setTodoToEdit(null);
    } catch (err) {
      setError('Error updating todo: ' + err.message);
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
      // Detect user's current timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await authenticatedFetch('/email/update-schedule', {
        method: 'POST',
        body: JSON.stringify({ hour, minute, timezone: userTimezone, email_enabled: emailEnabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update schedule');
      }

      const resp2 = await authenticatedFetch('/email/update-instructions', {
        method: 'POST',
        body: JSON.stringify({ instructions: emailInstructions }),
      });

      if (!resp2.ok) {
        const errorData = await resp2.json();
        throw new Error(errorData.detail || 'Failed to update instructions');
      }

      const resp3 = await authenticatedFetch('/email/update-spaces', {
        method: 'POST',
        body: JSON.stringify({ space_ids: emailSpaceIds }),
      });

      if (!resp3.ok) {
        const errorData = await resp3.json();
        throw new Error(errorData.detail || 'Failed to update email spaces');
      }


      onCloseEmailSettings?.();
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
    .filter((todo) => todo.completed)
    .sort((a, b) => {
      // Sort completed todos by completion date (most recent first)
      const dateA = a.dateCompleted || a.dateAdded;
      const dateB = b.dateCompleted || b.dateAdded;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });


  return (
    <div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}


      {showUpdatePrompt && (
        <div className="bg-blue-900/20 border border-blue-800 text-blue-300 px-4 py-3 rounded-xl mb-4 flex justify-between items-center">
          <span>🔄 A new version is available!</span>
          <div className="space-x-2">
            <button
              onClick={handleUpdate}
              className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-500 transition-colors"
            >
              Update Now
            </button>
            <button
              onClick={() => setShowUpdatePrompt(false)}
              className="bg-gray-800 text-gray-300 px-3 py-1 rounded-lg text-sm hover:bg-gray-700 transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Spaces */}
      <div className="mb-6">
        <div className="flex items-center mb-3">
          <h2 className="text-lg font-semibold text-gray-100">
            Space:{' '}
            {activeSpace ? activeSpace.name : 'None'}
          </h2>
          {activeSpace && !activeSpace.is_default && (
            <button
              onClick={() => {
                setSpaceToEdit(activeSpace);
                setEditSpaceName(activeSpace.name);
                const isCollab = (activeSpace.member_ids?.length ?? 0) > 1 ||
                  (activeSpace.pending_emails?.length ?? 0) > 0;
                setEditSpaceCollaborative(isCollab);
                setInviteEmails(['']);
                setShowEditSpaceModal(true);
              }}
              className="ml-2 text-gray-400 hover:text-gray-200 text-sm border border-gray-700 px-2 py-1 rounded-lg hover:border-gray-600 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
        <div
          className="flex gap-2 overflow-x-auto whitespace-nowrap scroll-smooth mb-4 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {spaces.map(space => (
            <button
              key={space._id}
              onClick={() => setActiveSpace(space)}
              className={`px-4 py-2 rounded-xl text-base transition-colors flex-shrink-0 ${
                activeSpace && space._id === activeSpace._id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800'
              }`}
            >
              {space.name}
            </button>
          ))}
          <button
            onClick={() => { setShowAddSpaceModal(true); }}
            className="px-4 py-2 rounded-xl text-base bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800 transition-colors flex-shrink-0"
          >
            +
          </button>
        </div>
      </div>

      {activeSpace && activeSpace._id && spaceMembers.length > 1 && (
        <div className="mb-6 ml-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-1">Members:</h3>
          <ul className="text-gray-300 text-sm space-y-1">
            {spaceMembers.map((m) => (
              <li key={m.id}>{m.first_name || 'Unknown User'}</li>
            ))}
            {pendingInvites && pendingInvites.map((email) => (
              <li key={email} className="italic">{email} (pending)</li>
            ))}
          </ul>
        </div>
      )}


      {/* Categories - Horizontal wrapping pills */}
      {spaceLoading ? (
        <div className="text-center text-gray-400 py-6">Loading...</div>
      ) : (
        <>
      <div className="mb-6">
        {loadingCategories && (
          <div className="text-gray-400 mb-2">Loading categories...</div>
        )}
        <div className="flex items-center mb-3">
          <h2 className="text-lg font-semibold text-gray-100">
            Category: {activeCat}
          </h2>
          {activeCat !== "All" && (
            <button
              onClick={() => {
                setEditCatName(activeCat);
                setShowEditCategoryModal(true);
              }}
              className="ml-2 text-gray-400 hover:text-gray-200 text-sm border border-gray-700 px-2 py-1 rounded-lg hover:border-gray-600 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
        <div
          className="flex gap-2 overflow-x-auto whitespace-nowrap scroll-smooth mb-4 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <button
            onClick={() => setActiveCat('All')}
            className={`px-4 py-2 rounded-xl text-base transition-colors flex-shrink-0 ${
              activeCat === 'All'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800'
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
              className={`px-4 py-2 rounded-xl text-base transition-colors flex-shrink-0 ${
                catName === activeCat
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800'
              }`}
            >
              {catName}
            </button>
            );
          })}
          <button
            onClick={() => setShowAddCategoryModal(true)}
            className="px-4 py-2 rounded-xl text-base bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800 transition-colors flex-shrink-0"
          >
            +
          </button>
        </div>

      </div>


      {/* Add new todo */}
      <div className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Add a new task..."
            className="flex-1 p-3 border border-gray-800 rounded-xl bg-black text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none transition-colors"
            onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
          />
          <button
            onClick={handleAddTodo}
            disabled={loading}
            className="bg-blue-600 text-white w-12 h-12 rounded-xl hover:bg-blue-500 disabled:bg-blue-800 disabled:text-gray-400 flex items-center justify-center transition-colors shadow-lg"
          >
            {loading ? '...' : '+'}
          </button>
        </div>
      </div>

      {showAddSpaceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl">
            <h3 className="text-gray-100 text-lg font-bold mb-2">Create Space</h3>
            <input
              type="text"
              placeholder="Space name"
              value={newSpaceName}
              onChange={e => setNewSpaceName(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAddSpace()}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-center space-x-3">
              <button onClick={handleAddSpace} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-colors">Add</button>
              <button onClick={() => { setShowAddSpaceModal(false); setNewSpaceName(''); }} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showEditSpaceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl">
            {spaceToEdit && (spaceToEdit.owner_id === (user.id || user._id)) ? (
              <>
                <h3 className="text-gray-100 text-lg font-bold mb-2">Edit Space</h3>
                <input
                  type="text"
                  value={editSpaceName}
                  onChange={e => setEditSpaceName(e.target.value)}
                  className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="flex items-center space-x-2 text-gray-300">
                  <input
                    type="checkbox"
                    checked={editSpaceCollaborative}
                    onChange={e => setEditSpaceCollaborative(e.target.checked)}
                  />
                  <span>Collaborative</span>
                </label>
                {editSpaceCollaborative && (
                  <div className="space-y-2">
                    {inviteEmails.map((email, idx) => (
                      <input
                        key={idx}
                        type="text"
                        placeholder="Invite email"
                        value={email}
                        onChange={e => {
                          const updated = [...inviteEmails];
                          updated[idx] = e.target.value;
                          setInviteEmails(updated);
                        }}
                        className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setInviteEmails([...inviteEmails, ''])}
                      className="text-gray-300 border border-gray-700 px-2 py-1 rounded-lg hover:bg-gray-800"
                    >
                      +
                    </button>
                  </div>
                )}
                <div className="flex justify-center space-x-3">
                  <button onClick={handleUpdateSpace} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-colors">Save</button>
                  {spaceToEdit && (
                    <button onClick={() => { handleDeleteSpace(spaceToEdit._id); setShowEditSpaceModal(false); }} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg transition-colors">Delete</button>
                  )}
                  <button onClick={() => setShowEditSpaceModal(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-gray-100 text-lg font-bold mb-2">Space Options</h3>
                <div className="flex justify-center space-x-3">
                  {spaceToEdit && (
                    <button onClick={() => { handleLeaveSpace(spaceToEdit._id); setShowEditSpaceModal(false); }} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg transition-colors">Leave</button>
                  )}
                  <button onClick={() => setShowEditSpaceModal(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl">
            <h3 className="text-gray-100 text-lg font-bold mb-2">Add New Category</h3>
            <input
              type="text"
              placeholder="New category name"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAddCategory()}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleAddCategory}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setNewCat("");
                }}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl">
            <h3 className="text-gray-100 text-lg font-bold mb-2">Edit Category</h3>
            <input
              type="text"
              value={editCatName}
              onChange={(e) => setEditCatName(e.target.value)}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleRenameCategory}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  handleDeleteCategory(activeCat);
                  setShowEditCategoryModal(false);
                }}
                className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setShowEditCategoryModal(false)}
                className="bg-gray-800 text-gray-300 px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Todo list */}
      {loadingTodos && (
        <div className="text-gray-400 mb-2">Loading tasks...</div>
      )}
      <div className="space-y-3">
        {uncompletedTodos.map((todo) => (
          <TodoItem
            key={todo._id}
            todo={todo}
            categories={categories}
            editingCategory={editingCategory}
            setEditingCategory={setEditingCategory}
            handleUpdateCategory={handleUpdateCategory}
            handleUpdatePriority={handleUpdatePriority}
            handleCompleteTodo={handleCompleteTodo}
            handleDeleteTodo={handleDeleteTodo}
            isCollaborative={(activeSpace?.member_ids?.length ?? 0) > 1}
            onEdit={handleEditTodo}
          />
        ))}
      </div>

      {/* Show/Hide Completed Toggle Button */}
      {completedTodos.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="bg-gray-900 hover:bg-gray-800 text-gray-300 px-4 py-2 rounded-lg transition-colors border border-gray-800"
          >
            {showCompleted ? 'Hide Completed' : 'Show Completed'} ({completedTodos.length})
          </button>
        </div>
      )}

      {showCompleted && completedTodos.length > 0 && (
        <div className="mt-6 space-y-3">
          {completedTodos.map((todo) => (
            <TodoItem
              key={todo._id}
              todo={todo}
              categories={categories}
              editingCategory={editingCategory}
              setEditingCategory={setEditingCategory}
              handleUpdateCategory={handleUpdateCategory}
              handleUpdatePriority={handleUpdatePriority}
              handleCompleteTodo={handleCompleteTodo}
              handleDeleteTodo={handleDeleteTodo}
              isCollaborative={(activeSpace?.member_ids?.length ?? 0) > 1}
              onEdit={handleEditTodo}
            />
          ))}
        </div>
      )}

      </>
      )}

      {showEditTodoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl">
            <h3 className="text-gray-100 text-lg font-bold mb-2">Edit Todo</h3>
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Notes"
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={editCategoryVal}
              onChange={(e) => setEditCategoryVal(e.target.value)}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              value={editPriorityVal}
              onChange={(e) => setEditPriorityVal(e.target.value)}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none"
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <div className="relative">
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                placeholder="Select due date"
                className="w-full p-3 pr-8 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                style={{
                  colorScheme: 'dark',
                  position: 'relative'
                }}
              />
              {editDueDate && (
                <button
                  type="button"
                  onClick={() => setEditDueDate('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200 z-10"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex justify-center space-x-3">
              <button onClick={handleSaveTodoEdit} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-colors">Save</button>
              <button onClick={() => setShowEditTodoModal(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <TodoChatbot token={token} />

      {/* Email Settings Modal */}
      {showEmailSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-black border border-gray-800 rounded-xl p-6 w-80 text-gray-100 space-y-4 shadow-2xl">
              <h3 className="text-gray-100 text-lg font-bold mb-2">Email Settings</h3>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="emailEnabled"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-900 border-gray-700 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="emailEnabled" className="text-sm text-gray-300">
                  Enable daily email summaries
                </label>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Daily Summary Time</label>
                <input
                  type="time"
                  value={emailTime}
                  onChange={(e) => setEmailTime(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!emailEnabled}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Custom Instructions</label>
                <textarea
                  value={emailInstructions}
                  onChange={(e) => setEmailInstructions(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 p-2 rounded-lg h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Write like a Buddhist monk. Include a haiku at the end."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Spaces to Include</label>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {spaces.map((space) => (
                    <div key={space._id || 'default'} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`space-${space._id || 'default'}`}
                        disabled={!emailEnabled || space.is_default}
                        checked={space.is_default || emailSpaceIds.includes(space._id)}
                        onChange={(e) => {
                          const id = space._id;
                          if (e.target.checked) {
                            setEmailSpaceIds(Array.from(new Set([...emailSpaceIds, id])));
                          } else {
                            setEmailSpaceIds(emailSpaceIds.filter((sid) => sid !== id));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-900 border-gray-700 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <label htmlFor={`space-${space._id || 'default'}`} className="text-sm text-gray-300">
                        {space.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center space-x-3">
                <button
                  onClick={handleUpdateSchedule}
                  disabled={savingSchedule}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-gray-400 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  {savingSchedule ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={async () => {
                    // Reset form to original values without saving
                    try {
                      const response = await authenticatedFetch('/auth/me');
                      if (response?.ok) {
                        const userData = await response.json();
                        const h = String(userData?.summary_hour ?? 9).padStart(2, '0');
                        const m = String(userData?.summary_minute ?? 0).padStart(2, '0');
                        setEmailTime(`${h}:${m}`);
                        setEmailInstructions(userData?.email_instructions ?? '');
                        setEmailEnabled(userData?.email_enabled ?? false);
                        setEmailSpaceIds(userData?.email_spaces ?? []);
                      }
                    } catch (err) {
                      // If fetch fails, just close the modal
                    }
                    onCloseEmailSettings?.();
                  }}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>

              <div className="flex justify-center mt-4">
                <button
                  onClick={handleSendEmailSummary}
                  disabled={sendingEmail}
                  className="bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:text-gray-400 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
                >
                  {sendingEmail ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <span>📧</span>
                      <span>Send Email Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  );
}
