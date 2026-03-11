import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { MessageRenderer, PlainTextRenderer } from './MessageRenderer';
import { getStreamingBackendUrl } from '../utils/api';

interface ChatbotProps {
  activeSpace: any;
  token?: string;
  isActive?: boolean;
  pendingSessionId?: string | null;
  onSessionLoaded?: () => void;
}

interface SessionMeta {
  _id: string;
  title: string;
  created_at: string;
  updated_at: string;
  todo_id?: string;
  agent_id?: string;
}

const AGENTS = [
  { id: 'claude', label: 'Claude' },
  { id: 'openclaw', label: 'OpenClaw' },
];

export default function AgentChatbot({
  activeSpace,
  token,
  isActive = true,
  pendingSessionId,
  onSessionLoaded,
}: ChatbotProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; toolData?: any; agent_id?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [thinkingDots, setThinkingDots] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);
  const [isQuestionFocused, setIsQuestionFocused] = useState(false);

  // Session state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionMeta | null>(null);
  const [deleteSessionLoading, setDeleteSessionLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Task session mode: when viewing a task-linked session
  const [isTaskSession, setIsTaskSession] = useState(false);
  const [taskInitialMessage, setTaskInitialMessage] = useState<string | null>(null);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [completingTask, setCompletingTask] = useState(false);
  // External agent ownership: when session is claimed by an agent like openclaw
  const [sessionAgentId, setSessionAgentId] = useState<string | null>(null);
  // Whether the agent is waiting for a human response
  const [needsHumanResponse, setNeedsHumanResponse] = useState(false);
  // Direct agent chat: selected agent before a session is created
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const messageQueueRef = useRef<string[]>([]);
  const isStreamingRef = useRef(false);

  // -----------------------------------------------------------------------
  // Fetch sessions list
  // -----------------------------------------------------------------------
  const fetchSessions = useCallback(async () => {
    if (!token) return;
    setSessionsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeSpace?._id) {
        params.append('space_id', activeSpace._id);
      }
      const res = await fetch(`/agent/sessions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // Silently ignore fetch errors
    } finally {
      setSessionsLoading(false);
    }
  }, [token, activeSpace?._id]);

  // Debounced search handler
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    // Abort any in-flight search request
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      searchAbortRef.current = abortController;
      try {
        const params = new URLSearchParams({ q: query });
        if (activeSpace?._id) params.append('space_id', activeSpace._id);
        const res = await fetch(`/agent/sessions/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err: any) {
        // Ignore abort errors; silently ignore other search errors
        if (err?.name === 'AbortError') return;
      } finally {
        // Only clear searching state if this controller wasn't aborted
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);
  }, [token, activeSpace?._id]);

  // Cleanup search timeout and abort controller on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (searchAbortRef.current) searchAbortRef.current.abort();
    };
  }, []);

  // Fetch sessions on mount and when space changes
  useEffect(() => {
    if (!isTaskSession) {
      setCurrentSessionId(null);
      setMessages([]);
    }
    fetchSessions();
  }, [fetchSessions]);

  // -----------------------------------------------------------------------
  // Handle pendingSessionId — load a task-linked session
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!pendingSessionId || !token) return;

    const loadTaskSession = async () => {
      setLoading(true);
      setError('');
      setIsTaskSession(true);
      try {
        const res = await fetch(`/agent/sessions/${pendingSessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load session');
        const data = await res.json();
        const displayMessages = data.display_messages || [];
        setCurrentSessionId(pendingSessionId);
        // Track the linked todo ID for complete action
        if (data.todo_id) setActiveTodoId(data.todo_id);
        setTaskCompleted(false);
        // Save the first user message for reset functionality
        const firstUserMsg = displayMessages.find((m: any) => m.role === 'user');
        if (firstUserMsg) setTaskInitialMessage(firstUserMsg.content);

        // If waiting for agent (last message is user), auto-trigger streaming
        // BUT skip if session is claimed by an external agent (e.g. openclaw)
        const lastMsg = displayMessages[displayMessages.length - 1];
        const agentId = data.agent_id || null;
        setSessionAgentId(agentId);
        setNeedsHumanResponse(!!data.needs_human_response);
        if (lastMsg?.role === 'user' && !agentId) {
          // Don't pre-populate messages — let handleStreamingAsk add the user message itself
          // Show any earlier messages (if multi-turn), but skip the last user message
          const earlier = displayMessages.slice(0, -1);
          if (earlier.length > 0) {
            setMessages(earlier);
          }
          setTimeout(() => {
            handleStreamingAsk(lastMsg.content, false, pendingSessionId);
          }, 0);
        } else {
          // Session already has agent response, or is claimed by external agent — just display
          setMessages(displayMessages);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
      } finally {
        setLoading(false);
        onSessionLoaded?.();
      }
    };

    loadTaskSession();
  }, [pendingSessionId, token, onSessionLoaded]);

  // -----------------------------------------------------------------------
  // Close dropdown when clicking outside
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSessionDropdown(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };
    if (showSessionDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSessionDropdown]);

  // -----------------------------------------------------------------------
  // Scroll helpers
  // -----------------------------------------------------------------------
  const checkIfAtBottom = () => {
    if (!chatContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    return scrollTop + clientHeight >= scrollHeight - 50;
  };

  const handleScroll = () => {
    shouldAutoScrollRef.current = checkIfAtBottom();
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current && isActive && messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
      }, 10);
    }
  }, [messages, isActive, loading, needsHumanResponse]);

  // Whether we're waiting for an external agent (e.g. openclaw) to respond
  const isWaitingForExternalAgent = sessionAgentId && currentSessionId && messages.length > 0 && messages[messages.length - 1]?.role === 'user';

  // Thinking dots animation
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (loading || isWaitingForExternalAgent) {
      interval = setInterval(() => {
        setThinkingDots((d) => (d + 1) % 4);
      }, 500);
    } else {
      setThinkingDots(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, isWaitingForExternalAgent]);

  // Track online/offline status
  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);
  useEffect(() => {
    if ((!isWaitingForExternalAgent && !needsHumanResponse) || !token) return;
    // Don't poll when agent is waiting for human response
    if (needsHumanResponse) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/agent/sessions/${currentSessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const displayMessages = data.display_messages || [];
        const lastMsg = displayMessages[displayMessages.length - 1];
        if (lastMsg?.role === 'assistant') {
          setMessages(displayMessages);
        }
        setNeedsHumanResponse(!!data.needs_human_response);
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [isWaitingForExternalAgent, needsHumanResponse, currentSessionId, token]);

  // Lock body scroll when delete modal is open
  useEffect(() => {
    if (sessionToDelete) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [sessionToDelete]);

  // -----------------------------------------------------------------------
  // Load a past session
  // -----------------------------------------------------------------------
  const loadSession = async (sessionId: string) => {
    if (!token) return;
    setShowSessionDropdown(false);
    setLoading(true);
    setError('');

    // Determine if this is a task-linked session
    const sessionMeta = sessions.find(s => s._id === sessionId);
    const isTodoSession = !!sessionMeta?.todo_id;

    try {
      const res = await fetch(`/agent/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load session');
      const data = await res.json();
      const displayMessages = data.display_messages || [];
      setMessages(displayMessages);
      setCurrentSessionId(sessionId);
      setIsTaskSession(isTodoSession);
      setActiveTodoId(data.todo_id || null);
      setTaskCompleted(false);
      setSessionAgentId(data.agent_id || null);
      setNeedsHumanResponse(!!data.needs_human_response);
    } catch (err: any) {
      setError(err.message || 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Delete a session
  // -----------------------------------------------------------------------
  const requestDeleteSession = (session: SessionMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const deleteSession = async () => {
    if (!token || !sessionToDelete) return;

    setDeleteSessionLoading(true);
    try {
      await fetch(`/agent/sessions/${sessionToDelete._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSessions((prev) => prev.filter((s) => s._id !== sessionToDelete._id));
      if (currentSessionId === sessionToDelete._id) {
        setCurrentSessionId(null);
        setMessages([]);
        setIsTaskSession(false);
        setSessionAgentId(null);
      }
    } catch {
      // Ignore delete errors
    } finally {
      setDeleteSessionLoading(false);
      setSessionToDelete(null);
    }
  };

  // -----------------------------------------------------------------------
  // Start a new chat / go back to main assistant
  // -----------------------------------------------------------------------
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setShowSessionDropdown(false);
    setIsTaskSession(false);
    setActiveTodoId(null);
    setTaskCompleted(false);
    setCompletingTask(false);
    setSessionAgentId(null);
    setNeedsHumanResponse(false);
    setSelectedAgentId(null);
    setTaskInitialMessage(null);
    messageQueueRef.current = [];
  };

  // -----------------------------------------------------------------------
  // Reset task chat — delete session and restart with original message
  // -----------------------------------------------------------------------
  const handleResetTaskChat = async () => {
    if (!currentSessionId || !taskInitialMessage || !token) return;
    try {
      // Delete the current session
      await fetch(`/agent/sessions/${currentSessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Clear UI and start fresh
      setMessages([]);
      setCurrentSessionId(null);
      messageQueueRef.current = [];
      // Re-send the initial message (will create a new session)
      handleStreamingAsk(taskInitialMessage);
    } catch (err) {
      console.error('Failed to reset task chat:', err);
    }
  };

  // -----------------------------------------------------------------------
  // Complete the linked task from within the chat
  // -----------------------------------------------------------------------
  const handleCompleteTask = async () => {
    if (!activeTodoId || !token || completingTask || taskCompleted) return;
    setCompletingTask(true);
    try {
      const res = await fetch(`/todos/${activeTodoId}/complete`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to complete task');
      setTaskCompleted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to complete task');
    } finally {
      setCompletingTask(false);
    }
  };

  // -----------------------------------------------------------------------
  // Send a message
  // -----------------------------------------------------------------------
  const handleSend = async () => {
    if (!question.trim()) return;
    const userMessage = question;
    setQuestion('');
    shouldAutoScrollRef.current = true;

    // Direct agent chat: create a new session for the selected agent
    if (selectedAgentId && !currentSessionId) {
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
      try {
        const res = await fetch('/agent/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            space_id: activeSpace?._id,
            initial_message: userMessage,
            agent_id: selectedAgentId,
          }),
        });
        if (!res.ok) throw new Error('Failed to create session');
        const data = await res.json();
        setCurrentSessionId(data.session_id);
        setSessionAgentId(selectedAgentId);
        setSelectedAgentId(null);
        fetchSessions();
      } catch (err: any) {
        setError(err.message || 'Failed to create agent session');
      }
      return;
    }

    // If session is owned by an external agent, post via messaging API
    // so the external agent picks it up (don't stream to built-in agent)
    if (sessionAgentId && currentSessionId) {
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
      setNeedsHumanResponse(false);
      try {
        await fetch(`/agent/sessions/${currentSessionId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ role: 'user', content: userMessage }),
        });
      } catch (err: any) {
        setError(err.message || 'Failed to send message');
      }
      return;
    }

    if (isStreamingRef.current) {
      // Queue the message — show it in UI immediately
      messageQueueRef.current.push(userMessage);
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
      return;
    }

    handleStreamingAsk(userMessage);
  };

  // -----------------------------------------------------------------------
  // Streaming AI chat (main assistant mode)
  // -----------------------------------------------------------------------
  const processQueue = () => {
    if (messageQueueRef.current.length > 0) {
      const next = messageQueueRef.current.shift()!;
      // Message already shown in UI from handleSend
      handleStreamingAsk(next, true);
    }
  };

  const handleStreamingAsk = async (userQuestion: string, skipAddMessage?: boolean, overrideSessionId?: string) => {
    if (!skipAddMessage) {
      setMessages((prev) => [...prev, { role: 'user', content: userQuestion }]);
    }
    isStreamingRef.current = true;
    setLoading(true);
    setError('');

    let assistantResponse = { role: 'assistant', content: '' };
    let assistantMessageAdded = false;

    try {
      const params = new URLSearchParams();
      params.append('q', userQuestion);
      if (activeSpace?._id) {
        params.append('space_id', activeSpace._id);
      }
      const sessionId = overrideSessionId || currentSessionId;
      if (sessionId) {
        params.append('session_id', sessionId);
      }
      if (token) {
        params.append('token', token);
      }

      const backendUrl = getStreamingBackendUrl();
      const agentUrl = `${backendUrl}/agent/stream?${params.toString()}`;
      const es = new EventSource(agentUrl);

      es.addEventListener('ready', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.session_id && !currentSessionId && !overrideSessionId) {
          setCurrentSessionId(data.session_id);
        }
      });

      es.addEventListener('token', (e) => {
        const { token: responseToken } = JSON.parse((e as MessageEvent).data);
        assistantResponse.content += responseToken;

        if (!assistantMessageAdded) {
          setMessages((prev) => [...prev, { ...assistantResponse }]);
          setLoading(false);
          assistantMessageAdded = true;
        } else {
          setMessages((prev) => [...prev.slice(0, -1), { ...assistantResponse }]);
        }
      });

      es.addEventListener('tool_result', (e) => {
        const { tool, args, data } = JSON.parse((e as MessageEvent).data);

        const formatArgs = (args: any) => {
          if (!args || Object.keys(args).length === 0) return '';
          const readable = Object.entries(args)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          return `(${readable})`;
        };

        const formatResult = (data: any) => {
          if (data.ok === false) return `Error: ${data.error}`;
          if (data.tasks) return `Found ${data.tasks.length} tasks`;
          if (data.results) return `Found ${data.results.length} results`;
          if (data.entries) return `Found ${data.entries.length} journal entries`;
          if (data.entry) return data.entry ? `Journal entry from ${data.entry.date}` : `No journal entry found`;
          return 'Success';
        };

        const toolMessage = `Tool ${tool}${formatArgs(args)}: ${formatResult(data)}`;
        setMessages((prev) => [...prev, { role: 'system', content: toolMessage, toolData: { tool, args, data } }]);
      });

      es.addEventListener('done', () => {
        es.close();
        isStreamingRef.current = false;
        fetchSessions();
        processQueue();
      });

      es.addEventListener('error', () => {
        setError('Error receiving response');
        setLoading(false);
        isStreamingRef.current = false;
        es.close();
        messageQueueRef.current = [];
      });
    } catch (err: any) {
      setError(err.message || 'Error');
      setLoading(false);
      isStreamingRef.current = false;
      messageQueueRef.current = [];
    }
  };

  const handleOfflineClick = () => {
    if (!isOnline) {
      setShowOfflineMessage(true);
      setTimeout(() => {
        setShowOfflineMessage(false);
      }, 3000);
    }
  };

  // Format date for session list
  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isWaiting = loading;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="mb-2 flex items-center gap-2 flex-shrink-0">
        {isTaskSession ? (
          // Back + Reset + Complete buttons when viewing a task session
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={handleNewChat}
              className="bg-gray-700 text-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-600 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Assistant
            </button>
            <button
              onClick={handleResetTaskChat}
              disabled={loading || !taskInitialMessage}
              className="border border-gray-600 text-gray-400 px-3 py-1 rounded text-sm hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Reset Chat
            </button>
            {activeTodoId && (
              <button
                onClick={handleCompleteTask}
                disabled={completingTask || taskCompleted}
                className={`ml-auto px-3 py-1 rounded text-sm flex items-center gap-1.5 transition-colors ${
                  taskCompleted
                    ? 'bg-green-600/20 text-green-300 border border-green-500/30 cursor-default'
                    : 'bg-green-600/20 text-green-300 border border-green-500/30 hover:bg-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {completingTask ? 'Completing...' : taskCompleted ? 'Completed' : 'Complete Task'}
              </button>
            )}
          </div>
        ) : sessionAgentId && !isTaskSession && currentSessionId ? (
          // Back button + agent badge for direct agent chat sessions
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="bg-gray-700 text-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-600 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Assistant
            </button>
            <span className="bg-purple-600/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-xs font-medium">
              {AGENTS.find(a => a.id === sessionAgentId)?.label || sessionAgentId}
            </span>
          </div>
        ) : (
          // Past Chats dropdown (main assistant mode)
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowSessionDropdown(!showSessionDropdown)}
              disabled={sessionsLoading}
              className="bg-gray-700 text-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              Past Chats
              <ChevronDown className={`w-3 h-3 transition-transform ${showSessionDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showSessionDropdown && (
              <div className="absolute left-0 top-full mt-1 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 max-h-96 flex flex-col">
                {/* Search input */}
                <div className="px-2 pt-2 pb-1 border-b border-gray-700 flex-shrink-0">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search chats..."
                    className="w-full bg-gray-900 text-gray-200 text-sm px-2.5 py-1.5 rounded border border-gray-600 focus:border-accent focus:outline-none placeholder-gray-500"
                    autoFocus
                  />
                </div>

                <div className="overflow-y-auto custom-scrollbar flex-1">
                  {/* Search results mode */}
                  {searchQuery.trim() ? (
                    <>
                      {isSearching && (
                        <div className="px-3 py-3 text-sm text-gray-500 text-center">
                          Searching...
                        </div>
                      )}
                      {!isSearching && searchResults.length === 0 && (
                        <div className="px-3 py-3 text-sm text-gray-500 text-center">
                          No results found
                        </div>
                      )}
                      {searchResults.map((result) => (
                        <div
                          key={result._id}
                          onClick={() => {
                            loadSession(result._id);
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-700 transition-colors ${
                            currentSessionId === result._id ? 'bg-gray-700/50 border-l-2 border-accent' : ''
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <p className="text-gray-200 truncate">{result.title}</p>
                            <span className={`px-1 py-0 rounded text-[10px] font-medium flex-shrink-0 ${
                              result.match_source === 'title'
                                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                                : 'bg-green-600/20 text-green-300 border border-green-500/30'
                            }`}>
                              {result.match_source === 'title' ? 'title' : 'message'}
                            </span>
                          </div>
                          {result.preview && result.match_source === 'content' && (
                            <p className="text-gray-400 text-xs mt-0.5 truncate">{result.preview}</p>
                          )}
                          <p className="text-gray-500 text-xs">{formatSessionDate(result.updated_at)}</p>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {/* Normal session list mode */}
                      {sessions.length === 0 && !sessionsLoading && (
                        <div className="px-3 py-3 text-sm text-gray-500 text-center">
                          No past chats
                        </div>
                      )}

                      {sessions.map((session) => (
                        <div
                          key={session._id}
                          onClick={() => loadSession(session._id)}
                          className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-gray-700 transition-colors ${
                            currentSessionId === session._id ? 'bg-gray-700/50 border-l-2 border-accent' : ''
                          }`}
                        >
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="flex items-center gap-1.5">
                              <p className="text-gray-200 truncate">{session.title}</p>
                              {session.agent_id && !session.todo_id && (
                                <span className="bg-purple-600/20 text-purple-300 border border-purple-500/30 px-1.5 py-0 rounded text-[10px] font-medium flex-shrink-0">
                                  {AGENTS.find(a => a.id === session.agent_id)?.label || session.agent_id}
                                </span>
                              )}
                            </div>
                            <p className="text-gray-500 text-xs">{formatSessionDate(session.updated_at)}</p>
                          </div>
                          <button
                            onClick={(e) => requestDeleteSession(session, e)}
                            className="text-gray-500 hover:text-red-400 flex-shrink-0 text-xs px-1 transition-colors"
                            aria-label="Delete session"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* New Chat button */}
        {!isTaskSession && !(sessionAgentId && currentSessionId) && (messages.length > 0 || currentSessionId) && (
          <button
            onClick={handleNewChat}
            disabled={loading}
            className="ml-auto border border-gray-600 text-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            New Chat
          </button>
        )}
      </div>

      {sessionToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style={{overscrollBehavior: 'contain'}}>
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl overflow-y-auto" style={{maxHeight: 'calc(100dvh - 2rem)'}}>
            <h3 className="text-gray-100 text-lg font-bold mb-2">Delete chat?</h3>
            <p className="text-sm text-gray-300">
              Delete <span className="font-medium">&quot;{sessionToDelete.title}&quot;</span>? This can&apos;t be undone.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={deleteSession}
                disabled={deleteSessionLoading}
                className="border border-red-500 text-red-400 hover:bg-red-900/20 px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleteSessionLoading ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setSessionToDelete(null)}
                disabled={deleteSessionLoading}
                className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Messages container */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 mb-4 space-y-4 overflow-y-auto custom-scrollbar"
      >
        {/* Blank state when no messages */}
        {messages.length === 0 && !loading && !isTaskSession && (
          <div className="flex items-center justify-center min-h-full py-8">
            <div className="max-w-md text-center space-y-4 px-6">
              <p className="text-gray-300 text-base leading-relaxed">
                Hi, I&apos;m your personal assistant
              </p>
              <p className="text-gray-400 text-sm leading-relaxed">
                Ask me anything! I can help you manage your tasks, find information, and more.
              </p>

              <div className="text-left space-y-4 mt-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Task Management</h4>
                  <ul className="text-sm text-gray-400 space-y-1 ml-4">
                    <li>- Add, update, and search your tasks</li>
                    <li>- Get task recommendations and suggestions</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Journal Access</h4>
                  <ul className="text-sm text-gray-400 space-y-1 ml-4">
                    <li>- Add journal entries</li>
                    <li>- Search through your past reflections</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Information & Resources</h4>
                  <ul className="text-sm text-gray-400 space-y-1 ml-4">
                    <li>- Search the web for current information</li>
                  </ul>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800">
                <p className="text-sm text-gray-500 italic">
                  Try: &quot;What should I get done today?&quot; or &quot;Summarize my latest journals&quot;
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-2">Or chat directly with an agent:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => setSelectedAgentId(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedAgentId === null
                        ? 'bg-accent/20 text-accent border border-accent/40'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                    }`}
                  >
                    Built-in Assistant
                  </button>
                  {AGENTS.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        selectedAgentId === agent.id
                          ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                          : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                      }`}
                    >
                      {agent.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`${msg.role === 'assistant' ? 'w-full px-0' : 'max-w-xs lg:max-w-md px-4'} py-2 ${
              msg.role === 'user'
                ? 'bg-gray-800 text-gray-100 border border-gray-700 rounded-lg'
                : msg.role === 'system'
                ? 'bg-blue-900/30 text-blue-200 border border-blue-700/50 rounded-lg'
                : 'text-gray-100'
            }`}>
              {(msg.role === 'system' || msg.agent_id) && (
                <div className="text-xs mb-1 opacity-75 flex justify-between items-center">
                  <span className={msg.agent_id ? 'text-purple-400 font-medium' : ''}>
                    {msg.role === 'system' ? 'Tool' : msg.agent_id ? msg.agent_id : ''}
                  </span>
                </div>
              )}
              {msg.role === 'assistant' ? (
                <MessageRenderer content={msg.content} className="text-base" />
              ) : (
                <PlainTextRenderer content={msg.content} className="text-sm" />
              )}
            </div>
          </div>
        ))}
        {isWaiting && (
          <div className="flex justify-start">
            <div className="text-gray-100 w-full px-0 py-2">
              <div className="text-xs mb-1 opacity-75"></div>
              <div className="text-sm">
                {`Thinking${'.'.repeat(thinkingDots)}`}
              </div>
            </div>
          </div>
        )}
        {needsHumanResponse && !isWaiting && (
          <div className="flex justify-start">
            <div className="w-full px-3 py-2 bg-amber-900/20 border border-amber-700/50 rounded-lg">
              <p className="text-sm text-amber-300">Agent is waiting for your response</p>
            </div>
          </div>
        )}
        {isWaitingForExternalAgent && !isWaiting && !needsHumanResponse && (
          <div className="flex justify-start">
            <div className="text-purple-400 w-full px-0 py-2">
              <div className="text-xs mb-1 font-medium">{sessionAgentId}</div>
              <div className="text-sm text-gray-400">
                {`Waiting for response${'.'.repeat(thinkingDots)}`}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="mb-2 p-2 bg-red-900/20 border border-red-800 rounded-lg flex-shrink-0 flex justify-between items-start">
          <p className="text-red-300 text-sm flex-1">{error}</p>
          <button
            onClick={() => setError('')}
            className="text-red-300 hover:text-red-100 ml-2 flex-shrink-0 text-lg leading-none"
            aria-label="Close error message"
          >
            x
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 flex-shrink-0 items-end mb-4 relative">
        <div className="flex-1 relative">
          <textarea
            className={`w-full bg-gray-900 border border-gray-700 text-gray-100 rounded-lg p-3 focus:outline-none focus:border-accent resize-none min-h-[48px] max-h-[140px] overflow-y-auto ${
              !isOnline ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
                // Reset height after send
                const target = e.target as HTMLTextAreaElement;
                setTimeout(() => { target.style.height = 'auto'; }, 0);
              }
            }}
            placeholder={
              !isOnline
                ? "Assistant requires internet connection"
                : isTaskSession
                ? "Send a message about this task..."
                : sessionAgentId
                ? `Chat with ${AGENTS.find(a => a.id === sessionAgentId)?.label || sessionAgentId}...`
                : selectedAgentId
                ? `Chat with ${AGENTS.find(a => a.id === selectedAgentId)?.label || selectedAgentId}...`
                : "Ask a question..."
            }
            disabled={!isOnline}
            rows={1}
            onMouseEnter={() => !isOnline && setShowOfflineMessage(true)}
            onMouseLeave={() => setShowOfflineMessage(false)}
            onClick={handleOfflineClick}
            onFocus={() => setIsQuestionFocused(true)}
            onBlur={() => setIsQuestionFocused(false)}
            aria-label={isTaskSession ? "Send message about task" : "Ask assistant a question"}
          />
          {showOfflineMessage && !isOnline && (
            <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg z-10 w-full">
              <p className="text-sm text-gray-300">
                Network connection required to use Assistant mode. The assistant needs to communicate with AI services in real-time.
              </p>
            </div>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={!question.trim() || !isOnline}
          className={`border px-6 py-3 rounded-lg hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
            isQuestionFocused
              ? 'border-accent text-accent'
              : 'border-gray-700 text-gray-300 hover:text-gray-100'
          }`}
          onMouseEnter={() => !isOnline && setShowOfflineMessage(true)}
          onMouseLeave={() => setShowOfflineMessage(false)}
        >
          Send
        </button>
      </div>
    </div>
  );
}
