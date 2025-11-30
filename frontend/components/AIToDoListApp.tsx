import React, { useState, useEffect, useCallback, useRef } from "react";
import TodoItem from "./TodoItem";
import AgentChatbot from "./AgentChatbot";
import { useAuth } from "../context/AuthContext";
import Link from "next/link";
import InsightsComponent from "./InsightsComponent";
import JournalComponent from "./JournalComponent";
import SpaceDropdown from "./SpaceDropdown";
import { sortSpaces } from "../utils/spaceUtils";
import SwipeableViews from "react-swipeable-views-react-18-fix";

interface Props {
  user: any;
  token: string;
  onLogout?: () => void;
  onShowEmailSettings?: () => void;
  showEmailSettings?: boolean;
  onCloseEmailSettings?: () => void;
  showInsights?: boolean;
  onShowInsights?: () => void;
  onCloseInsights?: () => void;
  onShowExportModal?: () => void;
  onShowContactModal?: () => void;
  onShowAccountSettings?: () => void;
  isOffline?: boolean;
}

/**
 * AI-Todo main component
 * Backend classifies tasks automatically when creating todos
 */
export default function AIToDoListApp({
  user,
  token,
  onLogout,
  onShowEmailSettings,
  showEmailSettings,
  onCloseEmailSettings,
  showInsights,
  onShowInsights,
  onCloseInsights,
  onShowExportModal,
  onShowContactModal,
  onShowAccountSettings,
  isOffline,
}: Props) {
  const { logout, clearAuthExpired, authenticatedFetch } = useAuth();
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
  const activeSpaceRef = useRef<any>(null);
  const [showAddSpaceModal, setShowAddSpaceModal] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [showEditSpaceModal, setShowEditSpaceModal] = useState(false);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editSpaceCollaborative, setEditSpaceCollaborative] = useState(true);
  const [inviteEmails, setInviteEmails] = useState<string[]>(['']);
  const [spaceToEdit, setSpaceToEdit] = useState<any>(null);
  const [spaceMembers, setSpaceMembers] = useState<any[]>([]);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showOfflineTooltip, setShowOfflineTooltip] = useState(false);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeSpaceRef.current = activeSpace;
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


  // Loading state when switching spaces
  // Categories and todos load independently so we no longer gate the UI

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

  // Tab state
  const [activeTab, setActiveTab] = useState<'tasks' | 'agent' | 'journal'>('tasks');
  const [tabIndex, setTabIndex] = useState(0); // 0=tasks, 1=agent, 2=journal
  const tasksTabRef = useRef<HTMLDivElement>(null);
  const agentTabRef = useRef<HTMLDivElement>(null);
  const journalTabRef = useRef<HTMLDivElement>(null);


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
      let spacesData = spaces;
      if (spacesData.length === 0) {
        spacesData = await fetchSpaces();
      }
      const personal = (spacesData || []).find((s: any) => s.is_default || s.name === 'Personal');
      if (!userData?.email_spaces || userData.email_spaces.length === 0) {
        setEmailSpaceIds(personal ? [personal._id] : []);
      } else {
        setEmailSpaceIds(userData.email_spaces);
      }
      onShowEmailSettings?.();
      setError('');
    } catch (err) {
      handleError(err, 'Error loading email settings');
    }
  };

  // When the parent triggers the modal to open, load the latest email settings
  useEffect(() => {
    if (showEmailSettings) {
      handleOpenEmailSettings();
    }
    // `handleOpenEmailSettings` does not need to be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEmailSettings]);


  const fetchSpaces = useCallback(async () => {
    setLoadingSpaces(true);
    try {
      const response = await authenticatedFetch('/spaces');
      if (response.ok) {
        const data = await response.json();
        const sorted = sortSpaces(data);
        setSpaces(sorted);

        let storedId: string | null = null;
        if (typeof window !== 'undefined') {
          storedId = localStorage.getItem('active_space_id');
        }

        const currentId = activeSpaceRef.current?._id || storedId;
        const current = sorted.find(s => s._id === currentId) || sorted[0] || null;
        if (current?._id !== activeSpaceRef.current?._id) {
          activeSpaceRef.current = current;
          setActiveSpace(current);
        }
        return data;
      }
    } catch (err) {
      console.error('Error loading spaces', err);
      handleError(err);
    } finally {
      setLoadingSpaces(false);
    }
    return [];
  }, [authenticatedFetch, handleError]);

  const fetchMembers = useCallback(async () => {
    const fetchId = ++membersFetchIdRef.current;
    if (!activeSpace || !activeSpace._id) {
      if (fetchId === membersFetchIdRef.current) {
        setSpaceMembers([]);
      }
      return;
    }
    try {
      const resp = await authenticatedFetch(`/spaces/${activeSpace._id}/members`);
      if (resp?.ok) {
        const data = await resp.json();
        if (fetchId === membersFetchIdRef.current) {
          setSpaceMembers(data.members || []);
        }
      }
    } catch (err) {
      if (fetchId === membersFetchIdRef.current) {
        console.error('Error loading members', err);
        handleError(err);
      }
    }
  }, [authenticatedFetch, activeSpace, handleError]);

  // Fetch categories from MongoDB
  const fetchCategories = useCallback(async () => {
    const fetchId = ++categoriesFetchIdRef.current;

    // Don't fetch if no active space
    if (!activeSpace?._id) {
      return;
    }

    try {
      const response = await authenticatedFetch(`/categories?space_id=${activeSpace._id}`);
      if (!response?.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      if (fetchId === categoriesFetchIdRef.current) {
        setCategories(data);
      }
    } catch (err) {
      if (fetchId === categoriesFetchIdRef.current) {
        handleError(err, 'Error loading categories');
      }
    }
  }, [authenticatedFetch, activeSpace, handleError]);

  // Fetch todos from MongoDB
  const fetchTodos = useCallback(async (showLoading: boolean = true) => {
    const fetchId = ++todosFetchIdRef.current;
    if (showLoading) {
      setLoadingTodos(true);
    }
    try {
      const url = activeSpace && activeSpace._id ? `/todos?space_id=${activeSpace._id}` : '/todos';
      const response = await authenticatedFetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch todos');
      }
      const data = await response.json();
      if (fetchId === todosFetchIdRef.current) {
        setTodos(data);
      }
    } catch (err) {
      if (fetchId === todosFetchIdRef.current) {
        handleError(err, 'Error loading todos');
      }
    } finally {
      if (fetchId === todosFetchIdRef.current) {
        setLoadingTodos(false);
      }
    }
  }, [authenticatedFetch, activeSpace, handleError]);

  const fetchSpaceData = useCallback(() => {
    // Trigger fetches without waiting for all to finish
    fetchCategories();
    fetchTodos();
    fetchMembers();
  }, [fetchCategories, fetchTodos, fetchMembers]);

  // Handle tab change (from button click only - swiping is disabled)
  const handleTabChange = useCallback((index: number) => {
    const tabs: ('tasks' | 'agent' | 'journal')[] = ['tasks', 'agent', 'journal'];
    setTabIndex(index);
    setActiveTab(tabs[index]);
  }, []);

  // Scroll to top when clicking header
  const handleScrollToTop = useCallback(() => {
    const refMap = {
      tasks: tasksTabRef,
      agent: agentTabRef,
      journal: journalTabRef
    };
    const ref = refMap[activeTab];
    if (ref?.current) {
      ref.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeTab]);

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

  // Refresh data when navigating between main tabs
  useEffect(() => {
    if (activeTab === 'tasks') {
      // Always load latest tasks when entering tasks tab
      fetchTodos(false);
    }
    // Journal component fetches latest entry on mount when tab becomes active
  }, [activeTab, fetchTodos]);

  // Function to handle app update
  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          // Send SKIP_WAITING message to the waiting service worker
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });

          // Listen for the new service worker to take control, then reload
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          }, { once: true });
        } else {
          // Fallback if no waiting worker
          window.location.reload();
        }
      });
    } else {
      window.location.reload();
    }
  };

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(event.target as Node)) {
        setShowSettingsDropdown(false);
      }
    };

    if (showSettingsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettingsDropdown]);

  // Close offline tooltip after delay
  useEffect(() => {
    if (showOfflineTooltip) {
      const timer = setTimeout(() => setShowOfflineTooltip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showOfflineTooltip]);

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
      handleError(err, 'Error adding category');
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
        const createdSpace = await response.json();
        const spacesData = await fetchSpaces();
        if (spacesData?.length) {
          const newActive = spacesData.find((space: any) => space._id === createdSpace._id) || createdSpace;
          setActiveSpace(newActive);
        } else {
          setActiveSpace(createdSpace);
        }
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

      // Refresh categories and todos list
      await fetchCategories();
      await fetchTodos();
      setError('');
    } catch (err) {
      handleError(err, 'Error deleting category');
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
      handleError(err, 'Error renaming category');
    }
  };

  // Add new todo(s)
  const handleAddTodo = async () => {
    const lines = newTodo
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setLoading(true);
    setError('');

    try {
      // Create dateAdded in user's local timezone
      const now = new Date();
      const localDateString = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      const localTimeString = now.toLocaleTimeString('en-GB', { hour12: false }); // HH:MM:SS format
      const localISOString = `${localDateString}T${localTimeString}`;

      for (const line of lines) {
        const todo: any = {
          text: line,
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
        if (isUrl(line)) {
          todo.link = line;
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
      }

      // Refresh todos list
      await fetchTodos(false);
      setNewTodo('');
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        handleError(err, 'Error adding todo');
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
      handleError(err, 'Error deleting todo');
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
      handleError(err, 'Error updating todo');
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
      handleError(err, 'Error updating category');
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
      handleError(err, 'Error updating priority');
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
      handleError(err, 'Error updating todo');
    }
  };


  // Send email summary
  const handleSendEmailSummary = async () => {
    try {
      setSendingEmail(true);
      setError('');

      // Send an empty JSON body to satisfy some environments that
      // require a body when the content type is set
      const response = await authenticatedFetch('/email/send-summary', {
        method: 'POST',
        body: JSON.stringify({}),
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
      handleError(err, 'Error sending email summary');
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
      handleError(err, 'Error updating schedule');
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
    <div className="h-screen flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="flex-shrink-0 pt-8 pl-4 pr-2">
        <div
          className="flex justify-between items-center mb-1"
          onClick={handleScrollToTop}
        >
          <h1 className="text-xl font-bold mr-4">
            todolist.nyc
          </h1>
          <div
            className="flex items-center space-x-1"
            onClick={(e) => e.stopPropagation()}
          >
            {isOffline && (
              <div className="relative">
                <button
                  onClick={() => setShowOfflineTooltip(true)}
                  title="Offline"
                  className="focus:outline-none text-base px-2 py-1"
                >
                  📴
                </button>
                {showOfflineTooltip && (
                  <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-64 bg-gray-800 text-gray-100 text-xs p-2 rounded-lg shadow-lg z-10">
                    {"You're offline. Todos will be synced when you're back online."}
                  </div>
                )}
              </div>
            )}
            <SpaceDropdown
              spaces={spaces}
              activeSpace={activeSpace}
              user={user}
              loadingSpaces={loadingSpaces}
              onSpaceSelect={setActiveSpace}
              onCreateSpace={() => setShowAddSpaceModal(true)}
              onEditSpace={(space: any) => {
                setSpaceToEdit(space);
                setEditSpaceName(space.name);
                const isCollab = (space.member_ids?.length ?? 0) > 1 ||
                  (space.pending_emails?.length ?? 0) > 0;
                setEditSpaceCollaborative(isCollab);
                setInviteEmails(['']);
                setShowEditSpaceModal(true);
              }}
            />
            <div className="relative" ref={settingsDropdownRef}>
              <button
                onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
                className="text-accent hover:text-accent-light text-base px-2 py-1 flex items-center justify-center rounded-lg hover:bg-gray-900 transition-colors"
                title="Settings"
              >
                ⚙️
              </button>

              {showSettingsDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-black border border-gray-800 rounded-lg shadow-2xl z-50">
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      onShowAccountSettings?.();
                    }}
                    className="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-900 hover:text-gray-100 transition-colors rounded-t-lg"
                  >
                    Account
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      onShowEmailSettings?.();
                    }}
                    className="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-900 hover:text-gray-100 transition-colors"
                  >
                    Email Settings
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      onShowInsights?.();
                    }}
                    className="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-900 hover:text-gray-100 transition-colors"
                  >
                    Insights
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      onShowExportModal?.();
                    }}
                    className="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-900 hover:text-gray-100 transition-colors"
                  >
                    Export Data
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      onShowContactModal?.();
                    }}
                    className="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-900 hover:text-gray-100 transition-colors"
                  >
                    Contact
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      onLogout?.();
                    }}
                    className="w-full text-left px-4 py-3 text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors rounded-b-lg"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-xl mb-4 mx-4 flex-shrink-0 flex justify-between items-start">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError('')}
            className="text-red-300 hover:text-red-100 ml-2 flex-shrink-0 text-lg leading-none"
            aria-label="Close error message"
          >
            ×
          </button>
        </div>
      )}

      {showUpdatePrompt && (
        <div className="bg-accent/20 border border-accent-dark text-accent-light px-4 py-3 rounded-xl mb-4 mx-4 flex justify-between items-center flex-shrink-0">
          <span>🔄 A new version is available!</span>
          <button
            onClick={handleUpdate}
            className="bg-accent text-foreground px-3 py-1 rounded-lg text-sm hover:bg-accent-light transition-colors"
          >
            Reload
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => handleTabChange(0)}
          className={`flex-1 py-3 px-2 sm:px-6 font-medium text-sm transition-colors ${
            activeTab === 'tasks'
              ? 'text-accent border-b-2 border-accent'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Tasks
        </button>
        <button
          onClick={() => handleTabChange(1)}
          className={`flex-1 py-3 px-2 sm:px-6 font-medium text-sm transition-colors ${
            activeTab === 'agent'
              ? 'text-accent border-b-2 border-accent'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Agent
        </button>
        <button
          onClick={() => handleTabChange(2)}
          className={`flex-1 py-3 px-2 sm:px-6 font-medium text-sm transition-colors ${
            activeTab === 'journal'
              ? 'text-accent border-b-2 border-accent'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Journal
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        <SwipeableViews
          index={tabIndex}
          onChangeIndex={handleTabChange}
          style={{ height: '100%' }}
          containerStyle={{ height: '100%' }}
          resistance={true}
          ignoreNativeScroll={false}
          threshold={10}
          disabled={true}
          enableMouseEvents={false}
        >
        {/* Tasks Tab */}
        <div
          ref={tasksTabRef}
          style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
          className="custom-scrollbar"
        >
            <div>
          {/* Categories - Horizontal scroll (full width) */}
          <div className="mb-3 pt-4">
            {loadingCategories && (
              <div className="text-gray-400 mb-2 px-4">Loading categories...</div>
            )}
              <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
              <button
                onClick={() => setActiveCat('All')}
                className={`px-4 py-2 rounded-xl text-base transition-colors flex-shrink-0 ml-2 ${
                  activeCat === 'All'
                    ? 'bg-accent text-foreground shadow-lg'
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
                      ? 'bg-accent text-foreground shadow-lg'
                      : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800'
                  }`}
                >
                  {catName}
                </button>
                );
              })}
              <button
                onClick={() => setShowAddCategoryModal(true)}
                className="px-4 py-2 rounded-xl text-base bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800 transition-colors flex-shrink-0 mr-2"
              >
                +
              </button>
            </div>
          </div>

          {/* Rest of content with padding */}
          <div className="px-2">
      {/* Add new todo */}
      <div className="mb-5">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
            placeholder="Add a new task..."
            disabled={loading}
            className="flex-1 p-3 border border-gray-800 rounded-xl bg-black text-gray-100 placeholder-gray-500 focus:border-accent focus:outline-none transition-colors"
          />
          <button
            onClick={handleAddTodo}
            disabled={loading}
              className="bg-accent text-foreground w-12 h-12 rounded-xl hover:bg-accent-light disabled:bg-accent-dark disabled:text-gray-400 flex items-center justify-center transition-colors shadow-lg"
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
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
            <div className="flex justify-center space-x-3">
              <button onClick={handleAddSpace} className="bg-accent hover:bg-accent-light text-foreground px-6 py-2 rounded-lg transition-colors">Create</button>
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
                  className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-accent"
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
                        className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:ring-2 focus:ring-accent"
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
                  <button onClick={handleUpdateSpace} className="bg-accent hover:bg-accent-light text-foreground px-6 py-2 rounded-lg transition-colors">Save</button>
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
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleAddCategory}
                className="bg-accent hover:bg-accent-light text-foreground px-6 py-2 rounded-lg transition-colors"
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
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleRenameCategory}
                className="bg-accent text-foreground px-6 py-2 rounded-lg hover:bg-accent-dark transition-colors"
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
        <div className="mt-6 mb-4 flex justify-center">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="bg-gray-900 hover:bg-gray-800 text-gray-300 px-4 py-2 rounded-lg transition-colors border border-gray-800"
          >
            {showCompleted ? 'Hide Completed' : 'Show Completed'} ({completedTodos.length})
          </button>
        </div>
      )}

      {showCompleted && completedTodos.length > 0 && (
        <div className="mt-6 mb-4 space-y-3">
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
            <h3 className="text-gray-100 text-lg font-bold mb-2">Edit Task</h3>
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
            </div>
        </div>

        {/* Agent Tab */}
        <div
          ref={agentTabRef}
          style={{ padding: '16px 16px 0 16px', height: '100%', display: 'flex', flexDirection: 'column', touchAction: 'pan-y' }}
        >
          {/* Header Row with Page Title */}
          {/* <div className="mb-6" style={{ flexShrink: 0 }}>
            <h2 className="text-xl font-semibold text-gray-100">Agent</h2>
          </div> */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <AgentChatbot activeSpace={activeSpace} token={token} isActive={activeTab === 'agent'} />
          </div>
        </div>

        {/* Journal Tab */}
        <div
          ref={journalTabRef}
          style={{ padding: '16px 16px 0 16px', height: '100%', display: 'flex', flexDirection: 'column', touchAction: 'pan-y' }}
        >
          {/* Header Row with Page Title */}
          {/* <div className="mb-6" style={{ flexShrink: 0 }}>
            <h2 className="text-xl font-semibold text-gray-100">Journal</h2>
          </div> */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <JournalComponent token={token} activeSpace={activeSpace} />
          </div>
        </div>
      </SwipeableViews>
      </div>

      {/* Insights Modal */}
      {showInsights && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-black border border-gray-800 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-gray-100 text-lg font-bold">Insights</h3>
                <p className="text-sm text-gray-400">
                  {activeSpace?.name ? `${activeSpace.name} - ` : ''}Track your productivity trends.
                </p>
              </div>
              <button
                onClick={() => onCloseInsights?.()}
                className="text-gray-400 hover:text-gray-200"
                aria-label="Close insights"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto pr-2 -mr-2">
              <InsightsComponent token={token} activeSpace={activeSpace} />
            </div>
          </div>
        </div>
      )}

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
                  className="w-4 h-4 text-accent bg-gray-900 border-gray-700 rounded focus:ring-accent focus:ring-2"
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
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!emailEnabled}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Custom Instructions</label>
                <textarea
                  value={emailInstructions}
                  onChange={(e) => setEmailInstructions(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 p-2 rounded-lg h-24 resize-none focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Write like a Buddhist monk. Include a haiku at the end."
                  disabled={!emailEnabled}
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
                        disabled={!emailEnabled}
                        checked={emailSpaceIds.includes(space._id)}
                        onChange={(e) => {
                          const id = space._id;
                          if (e.target.checked) {
                            setEmailSpaceIds(Array.from(new Set([...emailSpaceIds, id])));
                          } else {
                            setEmailSpaceIds(emailSpaceIds.filter((sid) => sid !== id));
                          }
                        }}
                        className="w-4 h-4 text-accent bg-gray-900 border-gray-700 rounded focus:ring-accent focus:ring-2"
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
                  className="bg-accent hover:bg-accent-light disabled:bg-accent-dark disabled:text-gray-400 text-foreground px-6 py-2 rounded-lg transition-colors"
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
                        const allIds = spaces.map((s: any) => s._id);
                        if (userData?.email_spaces == null) {
                          setEmailSpaceIds(allIds);
                        } else {
                          setEmailSpaceIds(userData.email_spaces);
                        }
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
