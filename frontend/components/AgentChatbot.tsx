import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

interface ChatbotProps {
  activeSpace: any;
  token?: string;
}

// Maximum number of messages to retain (matches backend MAX_HISTORY)
const MAX_MESSAGES = 10;

export default function AgentChatbot({ activeSpace, token }: ChatbotProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(() => {
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
    setMessages((prev) => {
      const updated = [...prev, { role: 'user', content: userQuestion }];
      return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
    });
    setQuestion('');
    setLoading(true);
    setError('');

    const assistantResponse = { role: 'assistant', content: '' };
    setMessages((prev) => {
      const updated = [...prev, assistantResponse];
      return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
    });

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
        setMessages((prev) => [...prev]);
      });

      es.addEventListener('tool_result', (e) => {
        const { tool, data } = JSON.parse((e as MessageEvent).data);
        setMessages((prev) => {
          const updated = [...prev, { role: 'assistant', content: `[${tool}] ${JSON.stringify(data)}` }];
          return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
        });
      });

      es.addEventListener('done', () => {
        setLoading(false);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="flex flex-col">
      {/* Messages container */}
      <div className="mb-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
              msg.role === 'user'
                ? 'bg-accent text-foreground'
                : 'bg-gray-800 text-gray-100 border border-gray-700'
            }`}>
              <div className="text-xs mb-1 opacity-75">
                {msg.role === 'user' ? 'You' : 'Agent'}
              </div>
              <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
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
          onClick={handleClear}
          disabled={loading || messages.length === 0}
          className="bg-gray-700 text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
        >
          Clear
        </button>
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
