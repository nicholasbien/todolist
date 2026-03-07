import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { MessageRenderer, PlainTextRenderer } from './MessageRenderer';

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
}

export default function AgentChatbot({ activeSpace, token, isActive = true, pendingSessionId, onSessionLoaded }: ChatbotProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastKnownCountRef = useRef(0);

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
  // Polling logic — always poll the active session for new messages
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!currentSessionId || !isActive || !token) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Set initial known count
    lastKnownCountRef.current = messages.length;

    const poll = async () => {
      try {
        const res = await fetch(`/agent/sessions/${currentSessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverMessages = data.display_messages || [];

        if (serverMessages.length > lastKnownCountRef.current) {
          setMessages(serverMessages);
          lastKnownCountRef.current = serverMessages.length;
          if (serverMessages[serverMessages.length - 1]?.role === 'assistant') {
            setLoading(false);
          }
        }
      } catch {
        // Ignore polling errors
      }
    };

    // Poll immediately once, then every 5 seconds
    poll();
    pollingRef.current = setInterval(poll, 5000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [currentSessionId, isActive, token]);

  // Load session from parent (e.g., clicking chat icon on a task)
  useEffect(() => {
    if (pendingSessionId && pendingSessionId !== currentSessionId) {
      loadSession(pendingSessionId);
      onSessionLoaded?.();
    }
  }, [pendingSessionId]);

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
  // Start a new chat
  // -----------------------------------------------------------------------
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
  };

  // -----------------------------------------------------------------------
  // Send a message
  // -----------------------------------------------------------------------
  const handleAsk = async () => {
    if (!question.trim() || !token) return;

    const userQuestion = question;
    setMessages((prev) => [...prev, { role: 'user', content: userQuestion }]);
    setQuestion('');
    setLoading(true);
    setError('');
    shouldAutoScrollRef.current = true;

    try {
      let sessionId = currentSessionId;

      // Create session if needed
      if (!sessionId) {
        const createRes = await fetch('/agent/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: userQuestion.slice(0, 60),
            space_id: activeSpace?._id,
          }),
        });
        if (!createRes.ok) throw new Error('Failed to create session');
        const createData = await createRes.json();
        sessionId = createData.session_id;
        setCurrentSessionId(sessionId);
      }

      // Post user message
      const postRes = await fetch(`/agent/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: 'user', content: userQuestion }),
      });
      if (!postRes.ok) throw new Error('Failed to send message');
    } catch (err: any) {
      setError(err.message || 'Error sending message');
      setLoading(false);
    }
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

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: session title + new chat */}
      <div className="mb-2 flex items-center gap-2 flex-shrink-0">
        {currentSessionId && (
          <span className="text-sm text-gray-400 truncate flex-1">
            {sessions.find(s => s._id === currentSessionId)?.title || 'Chat'}
          </span>
        )}
        {(messages.length > 0 || currentSessionId) && (
          <button
            onClick={handleNewChat}
            disabled={loading}
            className="ml-auto border border-gray-600 text-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            New Chat
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
                Send a message to your agent
              </p>
              <p className="text-gray-400 text-sm leading-relaxed">
                Messages are picked up by your connected agent (Claude Code, etc.) which can do real work and respond.
              </p>
              <p className="text-gray-500 text-xs mt-4">
                Tip: Click the chat icon on any task to start a conversation about it.
              </p>
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
              {msg.role === 'assistant' ? (
                <MessageRenderer content={msg.content} className="text-base" />
              ) : (
                <PlainTextRenderer content={msg.content} className="text-sm" />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="text-gray-100 w-full px-0 py-2">
              <div className="text-xs mb-1 opacity-75"></div>
              <div className="text-sm">{`Waiting for agent${'.'.repeat(thinkingDots)}`}</div>
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
            onFocus={() => setIsQuestionFocused(true)}
            onBlur={() => setIsQuestionFocused(false)}
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
