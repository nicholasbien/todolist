import React, { useState, useEffect, useCallback, useRef } from "react";
import TodoItem from "./TodoItem";
import TodoChatbot from "./TodoChatbot";
import { useAuth } from "../context/AuthContext";
import { useOfflineData } from "../hooks/useOfflineData";
import Link from "next/link";
import InsightsComponent from "./InsightsComponent";
import JournalComponent from "./JournalComponent";
import SpaceDropdown from "./SpaceDropdown";
import { sortSpaces } from "../utils/spaceUtils";

interface Props {
  user: any;
  token: string;
  onLogout?: () => void;
  onShowEmailSettings?: () => void;
  showEmailSettings?: boolean;
  onCloseEmailSettings?: () => void;
  onOfflineStatusChange?: (isOnline: boolean, queuedCount: number) => void;
}

/**
 * AI-Todo main component with unified offline functionality
 * Works seamlessly across web and Capacitor environments
 */
export default function AIToDoListAppWithOffline({ user, token, onLogout, onShowEmailSettings, showEmailSettings, onCloseEmailSettings, onOfflineStatusChange }: Props) {

  const { logout, clearAuthExpired, authenticatedFetch, isAuthenticated, isLoading } = useAuth();

  // Only use offline data hooks when user is authenticated and not loading
  const offlineDataHook = useOfflineData();
  const {
    getTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    getCategories,
    addCategory,
    getSpaces,
    addSpace,
    getJournals,
    saveJournal,
    syncNow,
    clearOfflineData,
    isOnline,
    isSyncing,
    queuedCount,
    isInitialized
  } = offlineDataHook;

  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [error, setError] = useState<React.ReactNode>("");
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
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [activeSpace, setActiveSpace] = useState(null);
  const [showAddSpaceModal, setShowAddSpaceModal] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [showEditSpaceModal, setShowEditSpaceModal] = useState(false);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editSpaceCollaborative, setEditSpaceCollaborative] = useState(true);
  const [inviteEmails, setInviteEmails] = useState<string[]>(['']);
  const [spaceToEdit, setSpaceToEdit] = useState<any>(null);
  const [spaceMembers, setSpaceMembers] = useState<any[]>([]);

  // Tab state
  const [activeTab, setActiveTab] = useState('tasks');

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeSpace && activeSpace._id) {
      localStorage.setItem('active_space_id', activeSpace._id);
    } else {
      localStorage.removeItem('active_space_id');
    }
  }, [activeSpace]);

  const handleError = useCallback(
    (err: any, prefix?: string) => {
      if (err?.message === 'Authentication expired') {
        setError(
          <>
            Session expired.{' '}
            <Link href="/" onClick={clearAuthExpired} className="underline text-blue-400">
              Sign in again
            </Link>
          </>
        );
        return;
      }
      setError(prefix ? `${prefix}: ${err.message || err}` : err.message || String(err));
    },
    [clearAuthExpired]
  );

  // Fetch spaces - matches original pattern
  const fetchSpaces = useCallback(async () => {
    setLoadingSpaces(true);
    try {
      console.log('📁 Component fetchSpaces called...');
      console.log('📁 About to call getSpaces()...');
      const spacesData = await getSpaces();
      console.log('📁 Component received spaces data:', spacesData);
      console.log('📁 Spaces data type:', typeof spacesData, 'isArray:', Array.isArray(spacesData));
      console.log('📁 Type of spacesData:', typeof spacesData, 'Array?', Array.isArray(spacesData));
      console.log('📁 First space structure:', spacesData?.[0]);

      if (!spacesData || !Array.isArray(spacesData)) {
        console.error('❌ Invalid spacesData received:', spacesData);
        return [];
      }

      const sorted = sortSpaces(spacesData);
      console.log('📁 Sorted spaces:', sorted);
      console.log('📁 About to call setSpaces with:', sorted.length, 'items');
      setSpaces(sorted);
      console.log('📁 setSpaces called');

      let storedId: string | null = null;
      if (typeof window !== 'undefined') {
        storedId = localStorage.getItem('active_space_id');
      }

      const currentId = activeSpace?._id || storedId;
      console.log('📁 Looking for space with currentId:', currentId);
      const current = sorted.find(s => s._id === currentId) || sorted[0] || null;
      console.log('📁 Found current space:', current?.name, 'current._id:', current?._id, 'activeSpace._id:', activeSpace?._id);
      if (current?._id !== activeSpace?._id) {
        console.log('📁 Setting active space to:', current?.name, 'ID:', current?._id);
        console.log('📁 Previous activeSpace was:', activeSpace?.name, 'ID:', activeSpace?._id);
        setActiveSpace(current);
        console.log('📁 setActiveSpace called with:', current?.name);
      } else {
        console.log('📁 Active space unchanged:', current?.name);
      }
      return spacesData;
    } catch (err) {
      console.error('Error loading spaces', err);
      handleError(err);
    } finally {
      console.log('📁 setLoadingSpaces(false)');
      setLoadingSpaces(false);
    }
    return [];
  }, [getSpaces, activeSpace, handleError]);

  // Fetch categories - matches original pattern
  const fetchCategories = useCallback(async () => {
    const fetchId = ++categoriesFetchIdRef.current;

    // Don't fetch if no active space
    if (!activeSpace?._id) {
      return;
    }

    try {
      console.log('📂 Fetching categories for space:', activeSpace.name);
      const categoriesData = await getCategories(activeSpace._id);
      if (fetchId === categoriesFetchIdRef.current) {
        const categoryNames = categoriesData.map(c => c.name);
        // Ensure "All" is always first, then add unique categories
        const allCategories = ['All', ...categoryNames.filter(name => name !== 'All')];
        setCategories(allCategories);
      }
    } catch (err) {
      if (fetchId === categoriesFetchIdRef.current) {
        handleError(err, 'Error loading categories');
      }
    }
  }, [getCategories, activeSpace, handleError]);

  // Fetch todos - matches original pattern
  const fetchTodos = useCallback(async (showLoading: boolean = true) => {
    console.log('📝 fetchTodos called - activeSpace:', activeSpace?.name, 'activeSpace._id:', activeSpace?._id);
    console.log('📝 Full activeSpace object:', activeSpace);
    const fetchId = ++todosFetchIdRef.current;
    if (showLoading) {
      setLoadingTodos(true);
    }
    try {
      console.log('📝 Fetching todos for space:', activeSpace?.name);
      const url = activeSpace && activeSpace._id ? activeSpace._id : null;
      console.log('📝 Todo URL:', url);
      if (!url) {
        console.log('❌ No URL for todos, activeSpace._id is missing');
        console.log('🔍 activeSpace keys:', activeSpace ? Object.keys(activeSpace) : 'activeSpace is null');
        return;
      }

      console.log('📝 Calling getTodos with spaceId:', url);
      const todosData = await getTodos(url);
      console.log('📝 Received todos data:', todosData?.length, 'items');
      if (fetchId === todosFetchIdRef.current) {
        console.log('📝 Setting todos state with:', todosData?.length, 'items');
        setTodos(todosData || []);
      }
    } catch (err) {
      console.error('❌ Error in fetchTodos:', err);
      if (fetchId === todosFetchIdRef.current) {
        handleError(err, 'Error loading todos');
      }
    } finally {
      if (fetchId === todosFetchIdRef.current && showLoading) {
        setLoadingTodos(false);
      }
    }
  }, [getTodos, activeSpace, handleError]);

  // Fetch space data - matches original pattern
  const fetchSpaceData = useCallback(() => {
    // Trigger fetches without waiting for all to finish
    fetchCategories();
    fetchTodos();
  }, [fetchCategories, fetchTodos]);

  // Initial load when token and user become available - matches original pattern
  useEffect(() => {
    const initializeApp = async () => {
      console.log('🔄 Initial load useEffect - token:', !!token, 'user:', !!user, 'isInitialized:', isInitialized, 'isLoading:', isLoading, 'isAuthenticated:', isAuthenticated);
      if (token && user && isInitialized && !isLoading && isAuthenticated) {
        console.log('🚀 Initial load: fetching spaces...');
        console.log('🔧 About to call fetchSpaces function...');
        console.log('🔍 fetchSpaces function type:', typeof fetchSpaces);
        try {
          const result = await fetchSpaces();
          console.log('✅ fetchSpaces call completed, result:', result);
        } catch (error) {
          console.error('❌ Error calling fetchSpaces:', error);
        }
      } else {
        console.log('⏳ Waiting for conditions - token:', !!token, 'user:', !!user, 'isInitialized:', isInitialized, 'isLoading:', isLoading, 'isAuthenticated:', isAuthenticated);
      }
    };

    initializeApp();
  }, [token, user, isInitialized, isLoading, isAuthenticated]); // Added auth state checks

  // Refetch data when active space changes - matches original pattern
  useEffect(() => {
    console.log('🏠 Space change effect triggered - activeSpace:', activeSpace?.name, 'token:', !!token, 'user:', !!user);
    if (token && user && activeSpace) {
      console.log('🏠 Active space changed, fetching data for:', activeSpace.name);
      // Hide current data immediately to show loading state
      setTodos([]);
      setCategories([]);
      // Fetch new data for the active space
      console.log('🏠 Calling fetchCategories and fetchTodos for:', activeSpace.name);
      fetchCategories();
      fetchTodos();
    } else {
      console.log('🏠 Conditions not met - token:', !!token, 'user:', !!user, 'activeSpace:', !!activeSpace);
    }
    // Reset category filter when switching spaces
    setActiveCat('All');
  }, [activeSpace]); // Simplified dependencies - only depend on activeSpace

  // Notify parent component of offline status changes
  useEffect(() => {
    if (onOfflineStatusChange) {
      onOfflineStatusChange(isOnline, queuedCount);
    }
  }, [isOnline, queuedCount, onOfflineStatusChange]);

  // Helper functions
  const isUrl = (text: string) => {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    if (!activeSpace) return;

    setLoading(true);
    setError('');

    try {
      const now = new Date();
      const localDateString = now.toLocaleDateString('en-CA');
      const localTimeString = now.toLocaleTimeString('en-GB', { hour12: false });
      const localISOString = `${localDateString}T${localTimeString}`;

      const todo: any = {
        text: newTodo,
        dateAdded: localISOString,
        completed: false,
        space_id: activeSpace._id
      };

      if (activeCat !== 'All') {
        todo.category = activeCat;
        todo.priority = 'Medium';
      }

      if (isUrl(newTodo)) {
        todo.link = newTodo;
      }

      await addTodo(todo);
      await fetchTodos(false);
      setNewTodo('');
    } catch (err) {
      handleError(err, 'Error adding todo');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTodo = async (id: string) => {
    try {
      if (!id || id === "None" || id === "undefined") {
        setError('Invalid todo ID');
        return;
      }

      await deleteTodo(id);
      await fetchTodos(false);
      setError('');
    } catch (err) {
      handleError(err, 'Error deleting todo');
    }
  };

  const handleCompleteTodo = async (todo: any) => {
    try {
      const updatedTodo = { ...todo, completed: !todo.completed };
      await updateTodo(updatedTodo);
      await fetchTodos(false);
    } catch (err) {
      handleError(err, 'Error updating todo');
    }
  };

  const handleUpdateCategory = async (todo: any, newCategory: string) => {
    try {
      const updatedTodo = { ...todo, category: newCategory };
      await updateTodo(updatedTodo);
      await fetchTodos(false);
    } catch (err) {
      handleError(err, 'Error updating category');
    }
  };

  const handleUpdatePriority = async (todo: any, newPriority: string) => {
    try {
      const updatedTodo = { ...todo, priority: newPriority };
      await updateTodo(updatedTodo);
      await fetchTodos(false);
    } catch (err) {
      handleError(err, 'Error updating priority');
    }
  };

  const handleEditTodo = (todo: any) => {
    setTodoToEdit(todo);
    setEditText(todo.text);
    setEditNotes(todo.notes || '');
    setEditCategoryVal(todo.category || 'General');
    setEditPriorityVal(todo.priority || 'Medium');
    setEditDueDate(todo.dueDate || '');
    setShowEditTodoModal(true);
  };

  const handleSaveTodoEdit = async () => {
    if (!todoToEdit) return;
    try {
      const updates: any = {
        ...todoToEdit,
        text: editText,
        notes: editNotes,
        category: editCategoryVal,
        priority: editPriorityVal,
        dueDate: editDueDate || null,
      };

      await updateTodo(updates);
      await fetchTodos(false);
      setShowEditTodoModal(false);
      setTodoToEdit(null);
    } catch (err) {
      handleError(err, 'Error updating todo');
    }
  };

  // Filter todos
  const filteredTodos = todos.filter((todo) =>
    activeCat === 'All' || todo.category === activeCat
  );
  const incompleteTodos = filteredTodos.filter(todo => !todo.completed);
  const completedTodos = filteredTodos.filter(todo => todo.completed);

  return (
    <div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {/* Tab Navigation - Full Width */}
      <div className="flex border-b border-gray-800 mb-4">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-3 px-2 sm:px-6 font-medium text-sm transition-colors ${
            activeTab === 'tasks'
              ? 'text-accent border-b-2 border-accent'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Tasks
        </button>
        <button
          onClick={() => setActiveTab('assistant')}
          className={`flex-1 py-3 px-2 sm:px-6 font-medium text-sm transition-colors ${
            activeTab === 'assistant'
              ? 'text-accent border-b-2 border-accent'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Assistant
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex-1 py-3 px-2 sm:px-6 font-medium text-sm transition-colors ${
            activeTab === 'insights'
              ? 'text-accent border-b-2 border-accent'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Insights
        </button>
        <button
          onClick={() => setActiveTab('journal')}
          className={`flex-1 py-3 px-2 sm:px-6 font-medium text-sm transition-colors ${
            activeTab === 'journal'
              ? 'text-accent border-b-2 border-accent'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Journal
        </button>
      </div>


      {/* Sync Status */}
      {isSyncing && (
        <div className="bg-blue-900/20 border border-blue-800 text-blue-300 px-4 py-3 rounded-xl mb-4">
          <span>🔄 Syncing...</span>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'tasks' && (
        <div>
          {console.log('🎯 TASKS TAB RENDERING - spaces:', spaces.length, 'activeSpace:', activeSpace?.name, 'todos:', todos.length, 'categories:', categories.length, 'loadingSpaces:', loadingSpaces, 'token:', !!token, 'user:', !!user)}
          {/* Header Row with Page Title and Space Dropdown */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-100">
                {activeCat === 'All' ? 'Tasks' : `Tasks: ${activeCat}`}
              </h2>
              {activeCat !== "All" && (
                <button
                  onClick={() => {
                    setEditCatName(activeCat);
                    setShowEditCategoryModal(true);
                  }}
                  className="text-gray-400 hover:text-gray-200 text-sm border border-gray-700 px-2 py-1 rounded-lg hover:border-gray-600 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            <SpaceDropdown
              spaces={spaces}
              activeSpace={activeSpace}
              user={user}
              loadingSpaces={loadingSpaces}
              onSpaceSelect={setActiveSpace}
              onCreateSpace={() => setShowAddSpaceModal(true)}
              onEditSpace={(space) => {
                setSpaceToEdit(space);
                setEditSpaceName(space.name);
                const isCollab = (space.member_ids?.length ?? 0) > 1 ||
                  (space.pending_emails?.length ?? 0) > 0;
                setEditSpaceCollaborative(isCollab);
                setInviteEmails(['']);
                setShowEditSpaceModal(true);
              }}
            />
          </div>

          {/* Add New Todo */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
              placeholder="Add a new todo..."
              className="flex-1 p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={handleAddTodo}
              disabled={loading || !newTodo.trim()}
              className="bg-accent hover:bg-accent-light disabled:bg-gray-700 text-foreground px-6 py-3 rounded-lg transition-colors font-medium disabled:cursor-not-allowed"
            >
              {loading ? 'Adding...' : 'Add'}
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  activeCat === cat
                    ? 'bg-accent text-foreground'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {cat}
              </button>
            ))}
            <button
              onClick={() => setShowAddCategoryModal(true)}
              className="px-3 py-1 rounded-full text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              + Add Category
            </button>
          </div>

          {/* Loading State */}
          {loadingTodos && (
            <div className="text-center py-4 text-gray-400">
              Loading todos...
            </div>
          )}

          {/* Incomplete Todos */}
          {!loadingTodos && (
            <div className="space-y-3">
              {incompleteTodos.map((todo) => (
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

              {incompleteTodos.length === 0 && !loadingTodos && (
                <div className="text-center py-8 text-gray-400">
                  No tasks yet. Add one above!
                </div>
              )}
            </div>
          )}

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

          {showEditTodoModal && (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
              <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl">
                <h3 className="text-gray-100 text-lg font-bold mb-2">Edit Todo</h3>
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes"
                  className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base h-24 resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <select
                  value={editCategoryVal}
                  onChange={(e) => setEditCategoryVal(e.target.value)}
                  className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none"
                >
                  {categories.filter(cat => cat !== 'All').map((cat) => (
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
                    className="w-full p-3 pr-8 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
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
                  <button onClick={handleSaveTodoEdit} className="bg-accent hover:bg-accent-light text-foreground px-6 py-2 rounded-lg transition-colors">Save</button>
                  <button onClick={() => setShowEditTodoModal(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'assistant' && (
        <div>
          {/* Header Row with Page Title and Space Dropdown */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-100">Assistant</h2>
            <SpaceDropdown
              spaces={spaces}
              activeSpace={activeSpace}
              user={user}
              loadingSpaces={loadingSpaces}
              onSpaceSelect={setActiveSpace}
              onCreateSpace={() => setShowAddSpaceModal(true)}
              onEditSpace={(space) => {
                setSpaceToEdit(space);
                setEditSpaceName(space.name);
                const isCollab = (space.member_ids?.length ?? 0) > 1 ||
                  (space.pending_emails?.length ?? 0) > 0;
                setEditSpaceCollaborative(isCollab);
                setInviteEmails(['']);
                setShowEditSpaceModal(true);
              }}
            />
          </div>
          <TodoChatbot token={token} activeSpace={activeSpace} />
        </div>
      )}

      {activeTab === 'insights' && (
        <div>
          {/* Header Row with Page Title and Space Dropdown */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-100">Insights</h2>
            <SpaceDropdown
              spaces={spaces}
              activeSpace={activeSpace}
              user={user}
              loadingSpaces={loadingSpaces}
              onSpaceSelect={setActiveSpace}
              onCreateSpace={() => setShowAddSpaceModal(true)}
              onEditSpace={(space) => {
                setSpaceToEdit(space);
                setEditSpaceName(space.name);
                const isCollab = (space.member_ids?.length ?? 0) > 1 ||
                  (space.pending_emails?.length ?? 0) > 0;
                setEditSpaceCollaborative(isCollab);
                setInviteEmails(['']);
                setShowEditSpaceModal(true);
              }}
            />
          </div>
          <InsightsComponent token={token} activeSpace={activeSpace} />
        </div>
      )}

      {activeTab === 'journal' && (
        <div>
          {/* Header Row with Page Title and Space Dropdown */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-100">Journal</h2>
            <SpaceDropdown
              spaces={spaces}
              activeSpace={activeSpace}
              user={user}
              loadingSpaces={loadingSpaces}
              onSpaceSelect={setActiveSpace}
              onCreateSpace={() => setShowAddSpaceModal(true)}
              onEditSpace={(space) => {
                setSpaceToEdit(space);
                setEditSpaceName(space.name);
                const isCollab = (space.member_ids?.length ?? 0) > 1 ||
                  (space.pending_emails?.length ?? 0) > 0;
                setEditSpaceCollaborative(isCollab);
                setInviteEmails(['']);
                setShowEditSpaceModal(true);
              }}
            />
          </div>
          <JournalComponent
            token={token}
            activeSpace={activeSpace}
            getJournals={getJournals}
            saveJournal={saveJournal}
          />
        </div>
      )}

    </div>
  );
}
