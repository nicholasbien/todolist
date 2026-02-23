import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { MessageRenderer, PlainTextRenderer } from './MessageRenderer';

interface ChatbotProps {
  activeSpace: any;
  token?: string;
  isActive?: boolean;
}

interface SessionMeta {
  _id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export default function AgentChatbot({ activeSpace, token, isActive = true }: ChatbotProps) {
  const [question, setQuestion] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [messages, setMessages] = useState<{ role: string; content: string; toolData?: any }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [thinkingDots, setThinkingDots] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);

  // Session state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Fetch sessions on mount and when space changes
  useEffect(() => {
    setCurrentSessionId(null);
    setMessages([]);
    fetchSessions();
  }, [fetchSessions]);

  // -----------------------------------------------------------------------
  // Close dropdown when clicking outside
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSessionDropdown(false);
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
        shouldAutoScrollRef.current = true;
      }, 10);
    }
  }, [messages, isActive]);

  // Thinking dots animation
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (loading) {
      interval = setInterval(() => {
        setThinkingDots((d) => (d + 1) % 4);
      }, 500);
    } else {
      setThinkingDots(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading]);

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

  // -----------------------------------------------------------------------
  // Load a past session
  // -----------------------------------------------------------------------
  const loadSession = async (sessionId: string) => {
    if (!token) return;
    setShowSessionDropdown(false);
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/agent/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load session');
      const data = await res.json();
      setMessages(data.display_messages || []);
      setCurrentSessionId(sessionId);
    } catch (err: any) {
      setError(err.message || 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Delete a session
  // -----------------------------------------------------------------------
  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    try {
      await fetch(`/agent/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSessions((prev) => prev.filter((s) => s._id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch {
      // Ignore delete errors
    }
  };

  // -----------------------------------------------------------------------
  // Start a new chat
  // -----------------------------------------------------------------------
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setShowSessionDropdown(false);
  };

  // -----------------------------------------------------------------------
  // Delete current chat session from DB and clear UI
  // -----------------------------------------------------------------------
  const handleDeleteChat = async () => {
    if (currentSessionId) {
      await deleteSession(currentSessionId, { stopPropagation: () => {} } as React.MouseEvent);
    } else {
      setMessages([]);
    }
  };

  // -----------------------------------------------------------------------
  // Send a message
  // -----------------------------------------------------------------------
  const handleAsk = async () => {
    if (!question.trim()) return;

    const userQuestion = question;
    setMessages((prev) => [...prev, { role: 'user', content: userQuestion }]);
    setQuestion('');
    setLoading(true);
    setError('');

    shouldAutoScrollRef.current = true;

    let assistantResponse = { role: 'assistant', content: '' };
    let assistantMessageAdded = false;

    try {
      const params = new URLSearchParams();
      params.append('q', userQuestion);
      if (activeSpace?._id) {
        params.append('space_id', activeSpace._id);
      }
      if (currentSessionId) {
        params.append('session_id', currentSessionId);
      }
      if (token) {
        params.append('token', token);
      }

      // Use the App Router route which pipes the backend SSE stream natively
      // without buffering.  The /api/agent prefix is in the SW passthrough
      // list so it bypasses service-worker interception entirely.
      const agentUrl = `/api/agent/stream?${params.toString()}`;
      const es = new EventSource(agentUrl);

      es.addEventListener('ready', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.session_id && !currentSessionId) {
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
          if (data.ok === false) return `❌ ${data.error}`;
          if (data.tasks) return `✅ Found ${data.tasks.length} tasks`;
          if (data.weather) return `🌤️ ${data.weather.location}: ${data.weather.temperature_display}`;
          if (data.books) return `📚 Found ${data.books.length} book recommendations`;
          if (data.quotes) return `💭 "${data.quotes[0]}"`;
          if (data.results) return `🔍 Found ${data.results.length} results`;
          if (data.entries) return `📖 Found ${data.entries.length} journal entries`;
          if (data.entry) return data.entry ? `📖 Journal entry from ${data.entry.date}` : `📖 No journal entry found`;
          return '✅ Success';
        };

        const toolMessage = `🔧 ${tool}${formatArgs(args)}: ${formatResult(data)}`;
        setMessages((prev) => [...prev, { role: 'system', content: toolMessage, toolData: { tool, args, data } }]);
      });

      es.addEventListener('done', () => {
        es.close();
        // Refresh sessions list after conversation completes
        fetchSessions();
      });

      es.addEventListener('error', () => {
        setError('Error receiving response');
        setLoading(false);
        es.close();
      });
    } catch (err: any) {
      setError(err.message || 'Error');
      setLoading(false);
    }
  };

  const toggleToolExpansion = (index: number) => {
    setExpandedTools((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
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

  // Remove sensitive database IDs and user info from tool data before displaying
  const sanitizeToolData = (data: any): any => {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map(item => sanitizeToolData(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const sensitiveFields = ['_id', 'id', 'user_id', 'space_id', 'owner_id', 'member_ids', 'pending_emails'];
      if (sensitiveFields.includes(key)) {
        continue;
      }
      sanitized[key] = sanitizeToolData(value);
    }
    return sanitized;
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

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: session dropdown + new chat + clear */}
      <div className="mb-2 flex items-center gap-2 flex-shrink-0">
        {/* Past Chats dropdown */}
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
            <div className="absolute left-0 top-full mt-1 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 max-h-80 overflow-y-auto custom-scrollbar">
              {/* New Chat option at top */}
              <button
                onClick={handleNewChat}
                className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-gray-700 border-b border-gray-700 transition-colors"
              >
                + New Chat
              </button>

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
                    <p className="text-gray-200 truncate">{session.title}</p>
                    <p className="text-gray-500 text-xs">{formatSessionDate(session.updated_at)}</p>
                  </div>
                  <button
                    onClick={(e) => deleteSession(session._id, e)}
                    className="text-gray-500 hover:text-red-400 flex-shrink-0 text-xs px-1 transition-colors"
                    aria-label="Delete session"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Chat button */}
        {(messages.length > 0 || currentSessionId) && (
          <button
            onClick={handleNewChat}
            disabled={loading}
            className="border border-gray-600 text-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            New Chat
          </button>
        )}

        {/* Delete Chat (push to right) */}
        {messages.length > 0 && (
          <button
            onClick={handleDeleteChat}
            disabled={loading}
            className="ml-auto bg-gray-700 text-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Delete Chat
          </button>
        )}
      </div>

      {/* Messages container */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 mb-4 space-y-4 overflow-y-auto custom-scrollbar"
      >
        {/* Blank state when no messages */}
        {messages.length === 0 && !loading && (
          <div className="flex items-center justify-center min-h-full py-8">
            <div className="max-w-md text-center space-y-4 px-6">
              <p className="text-gray-300 text-base leading-relaxed">
                Hi, I&apos;m your personal assistant
              </p>
              <p className="text-gray-400 text-sm leading-relaxed">
                Ask me anything! I can help you manage your tasks, check the weather, find information, and more.
              </p>

              <div className="text-left space-y-4 mt-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Task Management</h4>
                  <ul className="text-sm text-gray-400 space-y-1 ml-4">
                    <li>• Add, update, and search your tasks</li>
                    <li>• Get task recommendations and suggestions</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Journal Access</h4>
                  <ul className="text-sm text-gray-400 space-y-1 ml-4">
                    <li>• Add journal entries</li>
                    <li>• Search through your past reflections</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Information & Resources</h4>
                  <ul className="text-sm text-gray-400 space-y-1 ml-4">
                    <li>• Search the web for current information</li>
                    <li>• Check current weather and forecasts</li>
                    <li>• Get book recommendations</li>
                    <li>• Find inspirational quotes</li>
                  </ul>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800">
                <p className="text-sm text-gray-500 italic">
                  Try: &quot;What should I get done today?&quot;, &quot;Summarize my latest journals&quot;, or &quot;What&apos;s the weather in NYC?&quot;
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`${msg.role === 'assistant' ? 'w-full' : 'max-w-xs lg:max-w-md'} px-4 py-2 ${
              msg.role === 'user'
                ? 'bg-gray-800 text-gray-100 border border-gray-700 rounded-lg'
                : msg.role === 'system'
                ? 'bg-blue-900/30 text-blue-200 border border-blue-700/50 rounded-lg'
                : 'text-gray-100'
            }`}>
              <div className="text-sm mb-1 opacity-75 flex justify-between items-center">
                <span>{msg.role === 'system' ? 'Tool' : ''}</span>
                {/* Temporarily disabled - tool step dropdown
                {msg.role === 'system' && msg.toolData && (
                  <button
                    onClick={() => toggleToolExpansion(idx)}
                    className="text-sm text-blue-300 hover:text-blue-100 transition-colors"
                    aria-label={expandedTools.has(idx) ? 'Collapse tool details' : 'Expand tool details'}
                  >
                    {expandedTools.has(idx) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                )}
                */}
              </div>
              {msg.role === 'assistant' ? (
                <MessageRenderer content={msg.content} className="text-base" />
              ) : (
                <PlainTextRenderer content={msg.content} className="text-sm" />
              )}
              {/* Temporarily disabled - tool step input/output details
              {msg.role === 'system' && msg.toolData && expandedTools.has(idx) && (
                <div className="mt-2 pt-2 border-t border-blue-700/30 text-sm">
                  <div className="mb-1">
                    <span className="text-blue-300 font-medium">Input:</span>
                    <pre className="mt-1 bg-blue-950/50 p-2 rounded text-blue-100 overflow-x-auto">
                      {JSON.stringify(sanitizeToolData(msg.toolData.args), null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-blue-300 font-medium">Output:</span>
                    <pre className="mt-1 bg-blue-950/50 p-2 rounded text-blue-100 overflow-x-auto">
                      {JSON.stringify(sanitizeToolData(msg.toolData.data), null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              */}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="text-gray-100 w-full px-4 py-2">
              <div className="text-xs mb-1 opacity-75"></div>
              <div className="text-sm">{`Thinking${'.'.repeat(thinkingDots)}`}</div>
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
            ×
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 flex-shrink-0 items-center mb-4 relative">
        <div className="flex-1 relative">
          <input
            type="text"
            className={`w-full bg-gray-900 border border-gray-700 text-gray-100 rounded-lg p-3 focus:outline-none focus:border-accent ${
              !isOnline ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isOnline ? "Ask a question..." : "Assistant requires internet connection"}
            disabled={loading || !isOnline}
            onMouseEnter={() => !isOnline && setShowOfflineMessage(true)}
            onMouseLeave={() => setShowOfflineMessage(false)}
            onClick={handleOfflineClick}
            aria-label="Ask assistant a question"
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
          onClick={handleAsk}
          disabled={loading || !question.trim() || !isOnline}
          className="border border-accent text-accent px-6 py-3 rounded-lg hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onMouseEnter={() => !isOnline && setShowOfflineMessage(true)}
          onMouseLeave={() => setShowOfflineMessage(false)}
        >
          Send
        </button>
      </div>
    </div>
  );
}
