import React, { useState, useEffect, useRef } from 'react';

interface ChatbotProps {
  token: string;
}

export default function TodoChatbot({ token }: ChatbotProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('todo_chat_messages');
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
        sessionStorage.setItem('todo_chat_messages', JSON.stringify(messages));
      } catch {
        // Ignore write errors
      }
    }
  }, [messages]);

  const handleAsk = async () => {
    if (!question.trim()) return;

    // Add user message immediately
    const userQuestion = question;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userQuestion },
    ]);
    setQuestion('');
    setLoading(true);
    setError('');

    try {
      const resp = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: userQuestion }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.detail || 'Failed to get response');
      }
      const data = await resp.json();

      // Add assistant response
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer },
      ]);
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
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
      <h3 className="text-lg font-semibold mb-4 text-gray-100">AI Assistant</h3>

      {/* Messages container */}
      <div className="mb-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-100 border border-gray-700'
            }`}>
              <div className="text-xs mb-1 opacity-75">
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-100 border border-gray-700 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
              <div className="text-xs mb-1 opacity-75">Assistant</div>
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
          className="flex-1 bg-gray-900 border border-gray-700 text-gray-100 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question about your todos... (Enter to send, Shift+Enter for new line)"
          disabled={loading}
        />
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed transition-colors self-end"
        >
          Send
        </button>
      </div>
    </div>
  );
}
