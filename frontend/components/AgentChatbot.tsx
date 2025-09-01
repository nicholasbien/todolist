import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { MessageRenderer, PlainTextRenderer } from './MessageRenderer';

interface ChatbotProps {
  activeSpace: any;
  token?: string;
}

export default function AgentChatbot({ activeSpace, token }: ChatbotProps) {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
    if (typeof window !== 'undefined') {
      try {
        const spaceKey = `agent_chat_messages_${activeSpace?._id || 'default'}`;
        sessionStorage.setItem(spaceKey, JSON.stringify(messages));
      } catch {
        // Ignore write errors
      }
    }
  }, [messages, activeSpace]);

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

  const handleClear = () => {
    setMessages([]);
    if (typeof window !== 'undefined') {
      try {
        const spaceKey = `agent_chat_messages_${activeSpace?._id || 'default'}`;
        sessionStorage.removeItem(spaceKey);
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) return;

    const userQuestion = question;
    setMessages((prev) => [...prev, { role: 'user', content: userQuestion }]);
    setQuestion('');
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
      if (token) {
        params.append('token', token);
      }

      // Route to backend agent endpoint via service worker
      const agentUrl = Capacitor.isNativePlatform()
        ? `https://backend-production-e920.up.railway.app/agent/stream?${params.toString()}`
        : `/agent/stream?${params.toString()}`;

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

  return (
    <div className="flex flex-col">
      {/* Clear button at top */}
      {messages.length > 0 && (
        <div className="mb-2 flex justify-end">
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
      <div className="mb-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
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
                      {JSON.stringify(msg.toolData.args, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-blue-300 font-medium">Output:</span>
                    <pre className="mt-1 bg-blue-950/50 p-2 rounded text-blue-100 overflow-x-auto">
                      {JSON.stringify(msg.toolData.data, null, 2)}
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
              <div className="text-sm">Thinking...</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="mb-2 p-2 bg-red-900/20 border border-red-800 rounded-lg">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2">
        <textarea
          className="flex-1 bg-gray-900 border border-gray-700 text-gray-100 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question..."
          disabled={loading}
        />
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim() }
          className="bg-accent text-foreground px-6 py-2 rounded-lg hover:bg-accent-light disabled:bg-accent-dark disabled:cursor-not-allowed transition-colors self-end"
        >
          Send
        </button>
      </div>
    </div>
  );
}
