import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { MessageRenderer, PlainTextRenderer } from './MessageRenderer';

interface ChatbotProps {
  activeSpace: any;
  token?: string;
  isActive?: boolean;
}

export default function AgentChatbot({ activeSpace, token, isActive = true }: ChatbotProps) {
  const [question, setQuestion] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [messages, setMessages] = useState<{ role: string; content: string; toolData?: any }[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const spaceKey = `agent_chat_messages_${activeSpace?._id || 'default'}`;
        const stored = sessionStorage.getItem(spaceKey);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [thinkingDots, setThinkingDots] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const checkIfAtBottom = () => {
    if (!chatContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    // TODO: simplify the scrolling logic
    return scrollTop + clientHeight >= scrollHeight - 50; // 50px threshold for "at bottom"
  };

  const handleScroll = () => {
    // Update whether we should auto-scroll based on current position
    shouldAutoScrollRef.current = checkIfAtBottom();
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    // Only auto-scroll if we were at the bottom before the update AND tab is active AND we have messages
    // Don't auto-scroll when showing blank state (messages.length === 0)
    if (shouldAutoScrollRef.current && isActive && messages.length > 0) {
      // Small delay to ensure DOM updates are complete
      setTimeout(() => {
        scrollToBottom();
        // After scrolling, we're at the bottom again
        shouldAutoScrollRef.current = true;
      }, 10);
    }
    if (typeof window !== 'undefined') {
      try {
        const spaceKey = `agent_chat_messages_${activeSpace?._id || 'default'}`;
        sessionStorage.setItem(spaceKey, JSON.stringify(messages));
      } catch {
        // Ignore write errors
      }
    }
  }, [messages, activeSpace, isActive]);

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

  // Clear messages when space changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const spaceKey = `agent_chat_messages_${activeSpace?._id || 'default'}`;
        const stored = sessionStorage.getItem(spaceKey);
        setMessages(stored ? JSON.parse(stored) : []);
      } catch {
        setMessages([]);
      }
    }
  }, [activeSpace]);

  const handleClear = async () => {
    setMessages([]);
    if (typeof window !== 'undefined') {
      try {
        const spaceKey = `agent_chat_messages_${activeSpace?._id || 'default'}`;
        sessionStorage.removeItem(spaceKey);
      } catch {
        // Ignore storage errors
      }
    }

    try {
      const params = new URLSearchParams();
      if (activeSpace?._id) {
        params.append('space_id', activeSpace._id);
      }
      // Always use relative URL so service worker can intercept (for offline support)
      const clearUrl = `/agent/history?${params.toString()}`;

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch(clearUrl, { method: 'DELETE', headers });
    } catch {
      // Ignore network errors
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) return;

    const userQuestion = question;
    setMessages((prev) => [...prev, { role: 'user', content: userQuestion }]);
    setQuestion('');
    setLoading(true);
    setError('');

    // When user sends a message, they want to see the response, so scroll to bottom
    shouldAutoScrollRef.current = true;

    let assistantResponse = { role: 'assistant', content: '' };
    let assistantMessageAdded = false;

    try {
      const params = new URLSearchParams();
      params.append('q', userQuestion);
      if (activeSpace?._id) {
        params.append('space_id', activeSpace._id);
      }
      if (token) {
        params.append('token', token);
      }

      // Always use relative URL so service worker can intercept (for offline support)
      // Service worker will route to correct backend based on environment
      const agentUrl = `/agent/stream?${params.toString()}`;

      const es = new EventSource(agentUrl);

      es.addEventListener('token', (e) => {
        const { token: responseToken } = JSON.parse((e as MessageEvent).data);
        assistantResponse.content += responseToken;

        if (!assistantMessageAdded) {
          // First token - add assistant message to the conversation and stop loading
          setMessages((prev) => [...prev, { ...assistantResponse }]);
          setLoading(false);
          assistantMessageAdded = true;
        } else {
          // Update existing assistant message
          setMessages((prev) => [...prev.slice(0, -1), { ...assistantResponse }]);
        }
      });

      es.addEventListener('tool_result', (e) => {
        const { tool, args, data } = JSON.parse((e as MessageEvent).data);

        // Format tool inputs in a readable way
        const formatArgs = (args: any) => {
          if (!args || Object.keys(args).length === 0) return '';
          const readable = Object.entries(args)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          return `(${readable})`;
        };

        // Format tool results more concisely
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

  // Remove sensitive database IDs and user info from tool data before displaying
  const sanitizeToolData = (data: any): any => {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map(item => sanitizeToolData(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip sensitive ID fields and user identifiers
      const sensitiveFields = ['_id', 'id', 'user_id', 'space_id', 'owner_id', 'member_ids', 'pending_emails'];
      if (sensitiveFields.includes(key)) {
        continue;
      }
      sanitized[key] = sanitizeToolData(value);
    }
    return sanitized;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Clear button at top */}
      {messages.length > 0 && (
        <div className="mb-2 flex justify-end flex-shrink-0">
          <button
            onClick={handleClear}
            disabled={loading}
            className="bg-gray-700 text-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear Chat
          </button>
        </div>
      )}

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
                Hi, I&apos;m your personal agent
              </p>
              <p className="text-gray-400 text-sm leading-relaxed">
                Ask me anything! I can help you manage your tasks, check the weather, find information, and more.
              </p>

              <div className="text-left space-y-4 mt-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Task Management</h4>
                  <ul className="text-xs text-gray-400 space-y-1 ml-4">
                    <li>• Add, update, and search your tasks</li>
                    <li>• Get task recommendations and suggestions</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Journal Access</h4>
                  <ul className="text-xs text-gray-400 space-y-1 ml-4">
                    <li>• Add journal entries</li>
                    <li>• Search through your past reflections</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Information & Resources</h4>
                  <ul className="text-xs text-gray-400 space-y-1 ml-4">
                    <li>• Search the web for current information</li>
                    <li>• Check current weather and forecasts</li>
                    <li>• Get book recommendations</li>
                    <li>• Find inspirational quotes</li>
                  </ul>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800">
                <p className="text-xs text-gray-500 italic">
                  Try: &quot;What should I get done today?&quot;, &quot;Summarize my latest journals&quot;, or &quot;What&apos;s the weather in NYC?&quot;
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
              msg.role === 'user'
                ? 'bg-accent text-foreground'
                : msg.role === 'system'
                ? 'bg-blue-900/30 text-blue-200 border border-blue-700/50'
                : 'bg-gray-800 text-gray-100 border border-gray-700'
            }`}>
              <div className="text-xs mb-1 opacity-75 flex justify-between items-center">
                <span>{msg.role === 'user' ? 'You' : msg.role === 'system' ? 'Tool' : 'Agent'}</span>
                {msg.role === 'system' && msg.toolData && (
                  <button
                    onClick={() => toggleToolExpansion(idx)}
                    className="text-xs text-blue-300 hover:text-blue-100 transition-colors"
                  >
                    {expandedTools.has(idx) ? '▼' : '▶'}
                  </button>
                )}
              </div>
              {msg.role === 'assistant' ? (
                <MessageRenderer content={msg.content} className="text-sm" />
              ) : (
                <PlainTextRenderer content={msg.content} className="text-sm" />
              )}
              {msg.role === 'system' && msg.toolData && expandedTools.has(idx) && (
                <div className="mt-2 pt-2 border-t border-blue-700/30 text-xs">
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
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-100 border border-gray-700 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
              <div className="text-xs mb-1 opacity-75">Agent</div>
              <div className="text-sm">{`Thinking${'.'.repeat(thinkingDots)}`}</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="mb-2 p-2 bg-red-900/20 border border-red-800 rounded-lg flex-shrink-0">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 flex-shrink-0 items-center mb-4">
        <input
          type="text"
          className="flex-1 bg-gray-900 border border-gray-700 text-gray-100 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-accent"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question..."
          disabled={loading}
        />
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim() }
          className="bg-accent text-foreground px-6 py-3 rounded-lg hover:bg-accent-light disabled:bg-accent-dark disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
