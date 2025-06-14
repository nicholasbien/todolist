import React, { useState } from 'react';

interface ChatbotProps {
  token: string;
}

export default function TodoChatbot({ token }: ChatbotProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.detail || 'Failed to get response');
      }
      const data = await resp.json();
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: data.answer },
      ]);
      setQuestion('');
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 border-t border-gray-800 pt-4">
      <h3 className="text-lg font-semibold mb-2 text-gray-100">Chatbot</h3>
      <textarea
        className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded-lg p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={3}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask a question about your todos"
      />
      <button
        onClick={handleAsk}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 disabled:bg-blue-800"
      >
        {loading ? 'Thinking...' : 'Ask'}
      </button>
      {messages.map((msg, idx) => (
        <p key={idx} className="mt-3 text-gray-300 whitespace-pre-wrap">
          <strong>{msg.role === 'user' ? 'You: ' : 'Bot: '}</strong>
          {msg.content}
        </p>
      ))}
      {error && (
        <p className="mt-3 text-red-400">{error}</p>
      )}
    </div>
  );
}
