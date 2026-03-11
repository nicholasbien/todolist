import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface Memory {
  _id: string;
  key: string;
  value: string;
  agent_id: string;
  updated_at: string | null;
}

interface AgentMemoryViewerProps {
  token: string;
  activeSpace: any;
  onClose: () => void;
}

export default function AgentMemoryViewer({ token, activeSpace, onClose }: AgentMemoryViewerProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (activeSpace?._id) params.append('space_id', activeSpace._id);
      const res = await fetch(`/memories?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load memories');
      const data = await res.json();
      setMemories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [token, activeSpace?._id]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleDelete = async (memoryId: string) => {
    setDeletingId(memoryId);
    try {
      const res = await fetch(`/memories/${memoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete memory');
      setMemories((prev) => prev.filter((m) => m._id !== memoryId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete memory');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-gray-100 text-lg font-semibold">Agent Memory</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 transition-colors p-1"
          aria-label="Close memory viewer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-sm text-gray-400 mb-4 flex-shrink-0">
        Facts the assistant has learned about you. Delete any you&apos;d like the agent to forget.
      </p>

      {error && (
        <div className="mb-3 p-2 bg-red-900/20 border border-red-800 rounded-lg flex-shrink-0 flex justify-between items-center">
          <p className="text-red-300 text-sm flex-1">{error}</p>
          <button
            onClick={() => setError('')}
            className="text-red-300 hover:text-red-100 ml-2 flex-shrink-0 text-lg leading-none"
            aria-label="Close error"
          >
            x
          </button>
        </div>
      )}

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
        {loading && (
          <div className="text-gray-500 text-sm text-center py-8">Loading memories...</div>
        )}

        {!loading && memories.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No memories yet</p>
            <p className="text-gray-600 text-xs mt-1">
              As you chat with the assistant, it will remember useful facts about you here.
            </p>
          </div>
        )}

        {memories.map((memory) => (
          <div
            key={memory._id}
            className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 flex items-start gap-3 group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-accent text-sm font-medium">{memory.key}</span>
                <span className="text-gray-400 text-sm">{memory.value}</span>
              </div>
              {memory.updated_at && (
                <p className="text-gray-600 text-xs mt-1">{formatDate(memory.updated_at)}</p>
              )}
            </div>
            <button
              onClick={() => handleDelete(memory._id)}
              disabled={deletingId === memory._id}
              className="text-gray-600 hover:text-red-400 transition-colors text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 flex-shrink-0"
              aria-label={`Delete memory: ${memory.key}`}
            >
              {deletingId === memory._id ? '...' : 'delete'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
