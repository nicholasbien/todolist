import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowUpDown, GripVertical, Search, X } from "lucide-react";
import TodoItem from "./TodoItem";
import AgentChatbot from "./AgentChatbot";
import { useAuth } from "../context/AuthContext";
import Link from "next/link";
import InsightsComponent from "./InsightsComponent";
import JournalComponent from "./JournalComponent";
import SpaceDropdown from "./SpaceDropdown";
import { sortSpaces } from "../utils/spaceUtils";
import { loadSortModePreference, saveSortModePreference, type SortMode } from "../utils/sortPreferences";
import SwipeableViews from "react-swipeable-views-react-18-fix";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Capacitor } from "@capacitor/core";

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

function SortableItem({ id, children, disabled }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch">
      {!disabled && (
        <div
          {...attributes}
          {...listeners}
          className="touch-none flex items-center px-1.5 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
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
  const [todos, setTodos] = useState<any[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [isNewTodoFocused, setIsNewTodoFocused] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [error, setError] = useState<React.ReactNode>("");
  const [newCat, setNewCat] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [sortMode, setSortMode] = useState<SortMode>('auto');
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const isSortModeActive = sortOpen && sortMode === 'custom';
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editCatName, setEditCatName] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const isIosCapacitorApp = useRef(false);
  const [emailTime, setEmailTime] = useState('09:00');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [emailInstructions, setEmailInstructions] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailSpaceIds, setEmailSpaceIds] = useState<string[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [activeSpace, setActiveSpace] = useState<any>(null);
  const activeSpaceRef = useRef<any>(null);
  const [showAddSpaceModal, setShowAddSpaceModal] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [showEditSpaceModal, setShowEditSpaceModal] = useState(false);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editSpaceCollaborative, setEditSpaceCollaborative] = useState(true);
  const [inviteEmails, setInviteEmails] = useState<string[]>(['']);
  const [spaceToEdit, setSpaceToEdit] = useState<any>(null);
  const [spaceMembers, setSpaceMembers] = useState<any[]>([]);
  const [showOfflineTooltip, setShowOfflineTooltip] = useState(false);

  useEffect(() => {
    activeSpaceRef.current = activeSpace;
    if (typeof window === 'undefined') return;
    if (activeSpace && activeSpace._id) {
      localStorage.setItem('active_space_id', activeSpace._id);
    } else {
      localStorage.removeItem('active_space_id');
    }
  }, [activeSpace]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nativePlatform = Capacitor.getPlatform();
    isIosCapacitorApp.current = Capacitor.isNativePlatform() && nativePlatform === 'ios';
  }, []);

  useEffect(() => {
    if (!isIosCapacitorApp.current || !('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

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
  const [editSpaceId, setEditSpaceId] = useState<string>('');
  const [editSpaceCategories, setEditSpaceCategories] = useState<string[]>([]);
  const [newTodoAgent, setNewTodoAgent] = useState<string>('');

  // Long-press to edit category
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

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

  // Session state for task-linked chats
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [todoSessionStatuses, setTodoSessionStatuses] = useState<Record<string, string>>({});

  // Lock body scroll when any modal is open so background doesn't scroll (including when keyboard opens on mobile)
  useEffect(() => {
    const anyModalOpen = showAddSpaceModal || showEditSpaceModal || showAddCategoryModal || showEditCategoryModal || showEditTodoModal;
    if (anyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showAddSpaceModal, showEditSpaceModal, showAddCategoryModal, showEditCategoryModal, showEditTodoModal]);

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

  // Poll todo session statuses every 10 seconds
  useEffect(() => {
    if (!token || !activeSpace) return;
    const fetchStatuses = async () => {
      try {
        const params = new URLSearchParams();
        if (activeSpace?._id) params.append('space_id', activeSpace._id);
        const res = await authenticatedFetch(`/agent/sessions/todo-statuses?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setTodoSessionStatuses(data);
        }
      } catch {
        // Silently ignore
      }
    };
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [token, activeSpace, authenticatedFetch]);

  // Handle opening a task-linked chat session
  const handleChatAboutTodo = useCallback(async (todo: any) => {
    try {
      // Check for existing session
      const res = await authenticatedFetch(`/agent/sessions/by-todo/${todo._id}`);
      if (res.ok) {
        const session = await res.json();
        // Mark as read if needed
        if (session.has_unread_reply) {
          await authenticatedFetch(`/agent/sessions/${session._id}/mark-read`, { method: 'POST' });
          setTodoSessionStatuses(prev => {
            const next = { ...prev };
            delete next[todo._id];
            return next;
          });
        }
        setPendingSessionId(session._id);
      } else if (res.status === 404) {
        // Create new session linked to this todo
        const createRes = await authenticatedFetch('/agent/sessions', {
          method: 'POST',
          body: JSON.stringify({
            space_id: activeSpace?._id || null,
            title: todo.text,
            todo_id: todo._id,
            initial_message: [
              `I want to work on this task: "${todo.text}"`,
              todo.notes ? `Notes: ${todo.notes}` : null,
              `Help me get started.`,
            ].filter(Boolean).join('\n'),
            initial_role: 'user',
          }),
        });
        if (createRes.ok) {
          const session = await createRes.json();
          setPendingSessionId(session._id);
        }
      }
      // Switch to agent tab
      setTabIndex(1);
      setActiveTab('agent');
    } catch (err) {
      console.error('Error opening task chat:', err);
    }
  }, [authenticatedFetch, activeSpace]);

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
    // Restore sort mode for this space
    const spaceId = activeSpace?._id;
    setSortMode(loadSortModePreference(user, spaceId));
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

          if (isIosCapacitorApp.current && registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          registration.onupdatefound = () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.onstatechange = () => {
                if (
                  newWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  if (isIosCapacitorApp.current) {
                    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
                    return;
                  }

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

  // Refresh todos after service worker sync completes (IDs may have changed)
  useEffect(() => {
    const handleSyncMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        console.log('Sync complete — refreshing todos');
        fetchTodos(false);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSyncMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSyncMessage);
    };
  }, [fetchTodos]);

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
        body: JSON.stringify({ name: trimmedName || spaceToEdit.name, ...(!editSpaceCollaborative && { collaborative: false }) })
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
          space_id: activeSpace ? activeSpace._id : null,
          agent_id: newTodoAgent || null,
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
      setNewTodoAgent('');
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
      // Optimistic update
      setTodos(prev => prev.map(t => t._id === todoId ? { ...t, category: newCategory } : t));
      setEditingCategory(null);

      const response = await authenticatedFetch(`/todos/${todoId}`, {
        method: 'PUT',
        body: JSON.stringify({ category: newCategory }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update category');
      }

      setError('');
    } catch (err) {
      // Revert on failure
      await fetchTodos(false);
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


  const handleEditTodo = async (todo) => {
    setTodoToEdit(todo);
    setEditText(todo.text);
    setEditNotes(todo.notes || '');
    setEditCategoryVal(todo.category);
    setEditPriorityVal(todo.priority);

    // Initialize space - use fallback chain
    const initialSpaceId = todo.space_id || activeSpace?._id || '';
    setEditSpaceId(initialSpaceId);

    // Fetch categories for the todo's current space
    if (initialSpaceId) {
      try {
        const response = await authenticatedFetch(`/categories?space_id=${initialSpaceId}`);
        if (response.ok) {
          const cats = await response.json();
          setEditSpaceCategories(cats);
        }
      } catch (err) {
        console.error('Error fetching categories for space:', err);
        setEditSpaceCategories(['General']);
      }
    } else {
      // No space selected - use current space's categories
      setEditSpaceCategories(categories);
    }

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

  const handleEditSpaceChange = async (newSpaceId: string) => {
    setEditSpaceId(newSpaceId);

    // Fetch categories for the new space if provided
    if (newSpaceId) {
      try {
        const response = await authenticatedFetch(`/categories?space_id=${newSpaceId}`);
        if (response.ok) {
          const cats = await response.json();
          setEditSpaceCategories(cats);

          // If current category doesn't exist in new space, reset to "General"
          if (!cats.includes(editCategoryVal)) {
            setEditCategoryVal('General');
          }
        }
      } catch (err) {
        console.error('Error fetching categories for new space:', err);
        setEditSpaceCategories(['General']);
        setEditCategoryVal('General');
      }
    }
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
        space_id: editSpaceId, // Always include space_id since todos must have a space
      };
      // Optimistic update
      setTodos(prev => prev.map(t => t._id === todoToEdit._id ? { ...t, ...updates } : t));
      setShowEditTodoModal(false);

      const response = await authenticatedFetch(`/todos/${todoToEdit._id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update todo');
      }
      setTodoToEdit(null);
    } catch (err) {
      // Revert on failure
      await fetchTodos(false);
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


  // Sort mode handler — persist to localStorage
  const handleSortModeChange = useCallback((mode: SortMode) => {
    setSortMode(mode);
    const spaceId = activeSpace?._id;
    saveSortModePreference(user, spaceId, mode);

    // When switching to Custom, initialize sortOrder from Auto sort if not yet set
    if (mode === 'custom') {
      const uncompleted = todos.filter(t => !t.completed);
      const needsInit = uncompleted.every(t => t.sortOrder == null);
      if (needsInit && uncompleted.length > 0) {
        // Sort by Auto order (priority then date)
        const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
        const sorted = [...uncompleted].sort((a, b) => {
          const pd = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
          if (pd !== 0) return pd;
          return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
        });
        const ids = sorted.map(t => t._id);

        setTodos(prev => prev.map(t => {
          const idx = ids.indexOf(t._id);
          if (idx !== -1) return { ...t, sortOrder: idx };
          return t;
        }));

        authenticatedFetch('/todos/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ todoIds: ids }),
        }).catch(err => console.error('Failed to initialize sort order:', err));
      }
    }
  }, [activeSpace, todos, authenticatedFetch, user]);

  // Drag-and-drop sensors
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Handle drag end for custom sort
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setTodos(prev => {
      // Global uncompleted todos in current sort order
      const allUncompleted = prev
        .filter(t => !t.completed)
        .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));

      // Filtered view (what the user sees)
      const filtered = activeCat === 'All'
        ? allUncompleted
        : allUncompleted.filter(t => t.category === activeCat);
      const ids = filtered.map(t => t._id);

      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reorderedFiltered = arrayMove(filtered, oldIndex, newIndex);

      // Splice reordered items back into global positions
      const globalOrder = [...allUncompleted];
      let filterIdx = 0;
      for (let i = 0; i < globalOrder.length; i++) {
        if (activeCat === 'All' || globalOrder[i].category === activeCat) {
          globalOrder[i] = reorderedFiltered[filterIdx++];
        }
      }

      // Reassign sortOrder to the full global list
      const idToOrder = new Map<string, number>();
      globalOrder.forEach((t, i) => idToOrder.set(t._id, i));

      const updated = prev.map(t => {
        const order = idToOrder.get(t._id);
        if (order != null) return { ...t, sortOrder: order };
        return t;
      });

      // Persist all uncompleted todo IDs in new global order
      const allReorderedIds = globalOrder.map(t => t._id);
      authenticatedFetch('/todos/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoIds: allReorderedIds }),
      }).catch(err => console.error('Failed to save reorder:', err));

      return updated;
    });
  }, [authenticatedFetch, activeCat]);

  // Filter and sort todos by category
  const allFilteredTodos = (activeCat === "All"
    ? todos
    : todos.filter(todo => todo.category === activeCat))
    .filter(todo => !searchQuery || todo.text.toLowerCase().includes(searchQuery.toLowerCase()));

  // Sort function based on current sort mode
  const sortTodos = (a: any, b: any) => {
    switch (sortMode) {
      case 'date':
        return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
      case 'dueDate': {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      case 'custom': {
        const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      }
      default: {
        // Auto: priority then date
        const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
        const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
      }
    }
  };

  // Separate completed and uncompleted todos
  const uncompletedTodos = allFilteredTodos
    .filter(todo => !todo.completed)
    .sort(sortTodos);

  const uncompletedTodoIds = uncompletedTodos.map(t => t._id);

  const completedTodos = allFilteredTodos
    .filter((todo) => todo.completed)
    .sort((a, b) => {
      // Sort completed todos by completion date (most recent first)
      const dateA = a.dateCompleted || a.dateAdded;
      const dateB = b.dateCompleted || b.dateAdded;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });


  return (
    <div
      className="flex flex-col max-w-md mx-auto overflow-hidden"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      {/* Header - Manual safe area padding with contentInset:'never' */}
      <div className="flex-shrink-0 pl-4 pr-2 pt-4">
        <div
          className="flex justify-between items-center mb-1"
          onClick={handleScrollToTop}
        >
          <h1 className="text-xl font-bold mr-4">
            <Link href="/home" className="hover:text-accent transition-colors">
              todolist
            </Link>
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
            <select
              defaultValue=""
              onChange={(e) => {
                const action = e.target.value;
                e.target.value = '';
                if (action === 'account') onShowAccountSettings?.();
                else if (action === 'email') onShowEmailSettings?.();
                else if (action === 'insights') onShowInsights?.();
                else if (action === 'export') onShowExportModal?.();
                else if (action === 'contact') onShowContactModal?.();
                else if (action === 'logout') onLogout?.();
              }}
              className="bg-transparent text-gray-100 text-sm rounded border-0 focus:outline-none cursor-pointer"
              title="Settings"
            >
              <option value="" disabled>Settings</option>
              <option value="account">Account</option>
              <option value="email">Email Settings</option>
              <option value="insights">Insights</option>
              <option value="export">Export Data</option>
              <option value="contact">Contact</option>
              <option value="logout">Logout</option>
            </select>
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
            className="border border-accent text-accent px-3 py-1 rounded-lg text-sm hover:bg-accent/10 transition-colors"
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
          Assistant
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
          <div className="mb-1 pt-4">
            {loadingCategories && (
              <div className="text-gray-400 mb-2 px-4 text-center">Loading categories...</div>
            )}
              <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
              <button
                onClick={() => setActiveCat('All')}
                className={`disable-longpress-select px-4 py-2 rounded-xl text-base transition-colors flex-shrink-0 ml-2 ${
                  activeCat === 'All'
                    ? 'bg-gray-900 text-accent border border-accent'
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
                  onClick={() => {
                    if (longPressTriggeredRef.current) return;
                    setActiveCat(catName);
                  }}
                  onContextMenu={(e) => {
                    if (catName === 'General') return;
                    e.preventDefault();
                    setActiveCat(catName);
                    setEditCatName(catName);
                    setShowEditCategoryModal(true);
                  }}
                  onTouchStart={() => {
                    longPressTriggeredRef.current = false;
                    longPressTimerRef.current = setTimeout(() => {
                      if (catName === 'General') return;
                      longPressTriggeredRef.current = true;
                      setActiveCat(catName);
                      setEditCatName(catName);
                      setShowEditCategoryModal(true);
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
                  className={`disable-longpress-select px-4 py-2 rounded-xl text-base transition-colors flex-shrink-0 ${
                    catName === activeCat
                      ? 'bg-gray-900 text-accent border border-accent'
                      : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800'
                  }`}
                >
                  {catName}
                </button>
                );
              })}
              <button
                onClick={() => setShowAddCategoryModal(true)}
                className="disable-longpress-select px-4 py-2 rounded-xl text-base bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-gray-100 border border-gray-700 transition-colors flex-shrink-0 mr-2"
              >
                +
              </button>
            </div>
          </div>

          {/* Sort mode selector + search */}
          <div className="flex items-center px-3 mb-2 overflow-x-auto">
            <div className="flex items-center gap-2 flex-shrink-0 mr-4">
              <div>
                {searchOpen ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-900 border border-accent">
                    <Search size={14} className="text-accent flex-shrink-0" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setSearchQuery("");
                          setSearchOpen(false);
                        }
                      }}
                      placeholder="Search..."
                      className="w-40 bg-transparent text-xs text-gray-100 focus:outline-none placeholder-gray-500"
                    />
                    <button
                      onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
                      className="text-gray-400 hover:text-gray-200 flex-shrink-0"
                      aria-label="Close search"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSearchOpen(true);
                      setTimeout(() => searchInputRef.current?.focus(), 50);
                    }}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                    aria-label="Search tasks"
                  >
                    <Search size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setSortOpen(!sortOpen)}
                className={`p-1 rounded-lg transition-colors ${sortOpen ? 'text-accent' : 'text-gray-400 hover:text-gray-200'}`}
                aria-label="Sort options"
              >
                <ArrowUpDown size={14} />
              </button>
            </div>
            {sortOpen && (
              <div className="flex items-center gap-8">
                {(['auto', 'dueDate', 'date', 'custom'] as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleSortModeChange(mode)}
                    className={`py-1 text-xs whitespace-nowrap flex-shrink-0 transition-colors ${
                      sortMode === mode
                        ? 'text-accent'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {mode === 'auto' ? 'Auto' : mode === 'date' ? 'Date Added' : mode === 'dueDate' ? 'Due Date' : 'Custom'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Rest of content with padding */}
          <div className="px-2">
      {/* Add new todo */}
      <div className="mb-5">
        <div className="flex gap-2 items-end">
          <textarea
            value={newTodo}
            onChange={(e) => {
              setNewTodo(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onFocus={() => setIsNewTodoFocused(true)}
            onBlur={() => setIsNewTodoFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddTodo();
                // Reset height after submit
                const target = e.target as HTMLTextAreaElement;
                setTimeout(() => { target.style.height = 'auto'; }, 0);
              }
            }}
            placeholder="Add task(s)… (Shift+Enter for newline)"
            disabled={loading}
            aria-label="Add new task"
            rows={1}
            className="flex-1 p-3 border border-gray-800 rounded-xl bg-black text-gray-100 placeholder-gray-500 focus:border-accent focus:outline-none transition-colors resize-none min-h-[48px] max-h-[200px] overflow-y-auto"
          />
          <select
            value={newTodoAgent}
            onChange={(e) => setNewTodoAgent(e.target.value)}
            className="h-12 px-2 rounded-xl bg-gray-900 border border-gray-700 text-gray-200 text-sm focus:border-accent focus:outline-none transition-colors appearance-none cursor-pointer"
          >
            <option value="">Built-in</option>
            <option value="openclaw">OpenClaw</option>
            <option value="claude">Claude</option>
          </select>
          <button
            onClick={handleAddTodo}
            disabled={loading}
            className={`bg-gray-900 w-12 h-12 rounded-xl border hover:bg-gray-800 disabled:border-gray-700 disabled:text-gray-500 flex items-center justify-center transition-colors ${
              isNewTodoFocused
                ? 'border-accent text-accent'
                : 'border-gray-700 text-gray-300 hover:text-gray-100'
            }`}
          >
            {loading ? '...' : '+'}
          </button>
        </div>
      </div>

      {showAddSpaceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style={{overscrollBehavior: 'contain'}}>
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl overflow-y-auto" style={{maxHeight: 'calc(100dvh - 2rem)'}}>
            <h3 className="text-gray-100 text-lg font-bold mb-2">Create Space</h3>
            <input
              type="text"
              placeholder="Space name"
              value={newSpaceName}
              onChange={e => setNewSpaceName(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAddSpace()}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:border-accent"
              autoFocus
            />
            <div className="flex justify-center space-x-3">
              <button onClick={handleAddSpace} className="border border-accent text-accent hover:bg-accent/10 px-6 py-2 rounded-lg transition-colors">Create</button>
              <button onClick={() => { setShowAddSpaceModal(false); setNewSpaceName(''); }} className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showEditSpaceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style={{overscrollBehavior: 'contain'}}>
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl overflow-y-auto" style={{maxHeight: 'calc(100dvh - 2rem)'}}>
            {spaceToEdit && (spaceToEdit.owner_id === (user.id || user._id)) ? (
              <>
                <h3 className="text-gray-100 text-lg font-bold mb-2">Edit Space</h3>
                <input
                  type="text"
                  value={editSpaceName}
                  onChange={e => setEditSpaceName(e.target.value)}
                  className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:border-accent"
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
                        className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:border-accent"
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
                  <button onClick={handleUpdateSpace} className="border border-accent text-accent hover:bg-accent/10 px-6 py-2 rounded-lg transition-colors">Save</button>
                  {spaceToEdit && (
                    <button onClick={() => { handleDeleteSpace(spaceToEdit._id); setShowEditSpaceModal(false); }} className="border border-red-500 text-red-400 hover:bg-red-900/20 px-6 py-2 rounded-lg transition-colors">Delete</button>
                  )}
                  <button onClick={() => setShowEditSpaceModal(false)} className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-gray-100 text-lg font-bold mb-2">Space Options</h3>
                <div className="flex justify-center space-x-3">
                  {spaceToEdit && (
                    <button onClick={() => { handleLeaveSpace(spaceToEdit._id); setShowEditSpaceModal(false); }} className="border border-red-500 text-red-400 hover:bg-red-900/20 px-6 py-2 rounded-lg transition-colors">Leave</button>
                  )}
                  <button onClick={() => setShowEditSpaceModal(false)} className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style={{overscrollBehavior: 'contain'}}>
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl overflow-y-auto" style={{maxHeight: 'calc(100dvh - 2rem)'}}>
            <h3 className="text-gray-100 text-lg font-bold mb-2">Add New Category</h3>
            <input
              type="text"
              placeholder="New category name"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAddCategory()}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 text-base focus:outline-none focus:border-accent"
              autoFocus
            />
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleAddCategory}
                className="border border-accent text-accent hover:bg-accent/10 px-6 py-2 rounded-lg transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setNewCat("");
                }}
                className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style={{overscrollBehavior: 'contain'}}>
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl overflow-y-auto" style={{maxHeight: 'calc(100dvh - 2rem)'}}>
            <h3 className="text-gray-100 text-lg font-bold mb-2">Edit Category</h3>
            <input
              type="text"
              value={editCatName}
              onChange={(e) => setEditCatName(e.target.value)}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:border-accent"
            />
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleRenameCategory}
                className="border border-accent text-accent hover:bg-accent/10 px-6 py-2 rounded-lg transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  handleDeleteCategory(activeCat);
                  setShowEditCategoryModal(false);
                }}
                className="border border-red-500 text-red-400 px-6 py-2 rounded-lg hover:bg-red-900/20 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setShowEditCategoryModal(false)}
                className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Todo list */}
      {loadingTodos && (
        <div className="text-gray-400 mb-2 text-center">Loading tasks...</div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={uncompletedTodoIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {uncompletedTodos.map((todo) => (
              <SortableItem key={todo._id} id={todo._id} disabled={!isSortModeActive}>
                <TodoItem
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
                  onChat={handleChatAboutTodo}
                  sessionStatus={todoSessionStatuses[todo._id] as any}
                />
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style={{overscrollBehavior: 'contain'}}>
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl overflow-y-auto" style={{maxHeight: 'calc(100dvh - 2rem)'}}>
            <h3 className="text-gray-100 text-lg font-bold mb-2">Edit Task</h3>
            <textarea
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }
              }}
              rows={1}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:border-accent resize-none max-h-[200px] overflow-y-auto"
            />
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Notes"
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base h-24 resize-none focus:outline-none focus:border-accent"
            />
            <div>
              <label className="block text-sm text-gray-300 mb-2">Space</label>
              <select
                value={editSpaceId}
                onChange={(e) => handleEditSpaceChange(e.target.value)}
                className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none"
              >
                {editSpaceId && !spaces.some((space) => space._id === editSpaceId) && (
                  <option value={editSpaceId}>Current space</option>
                )}
                {spaces.map((space) => (
                  <option key={space._id || space.name} value={space._id}>
                    {space.name || 'Untitled Space'}
                  </option>
                ))}
              </select>
              {editSpaceId !== todoToEdit?.space_id && (
                <p className="text-yellow-500 text-sm mt-1">
                  ⚠ Moving to a different space
                </p>
              )}
            </div>
            <select
              value={editCategoryVal}
              onChange={(e) => setEditCategoryVal(e.target.value)}
              className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none"
            >
              {editSpaceCategories.map((cat) => (
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
                className="w-full p-3 pr-8 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-base focus:outline-none focus:border-accent cursor-pointer"
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
              <button onClick={handleSaveTodoEdit} className="border border-accent text-accent hover:bg-accent/10 px-6 py-2 rounded-lg transition-colors">Save</button>
              <button onClick={() => setShowEditTodoModal(false)} className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors">Cancel</button>
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
            <h2 className="text-xl font-semibold text-gray-100">Assistant</h2>
          </div> */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <AgentChatbot
              activeSpace={activeSpace}
              token={token}
              isActive={activeTab === 'agent'}
              pendingSessionId={pendingSessionId}
              onSessionLoaded={() => setPendingSessionId(null)}
            />
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
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 p-2 rounded-lg focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!emailEnabled}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Custom Instructions</label>
                <textarea
                  value={emailInstructions}
                  onChange={(e) => setEmailInstructions(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 p-2 rounded-lg h-24 resize-none focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="border border-accent text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-colors"
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
                  className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>

              <div className="flex justify-center mt-4">
                <button
                  onClick={handleSendEmailSummary}
                  disabled={sendingEmail}
                  className="border border-green-500 text-green-400 hover:bg-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
                >
                  {sendingEmail ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Sending...</span>
                    </>
                  ) : (
                    'Send Email Now'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  );
}
