import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Search, Trash2, ChevronDown, ChevronRight, Clock, Tag, Brain } from 'lucide-react';
import { parseBackendDate } from '../utils/dateUtils';

interface Memory {
  _id: string;
  key: string;
  value: string;
  category: string;
  agent_id: string;
  created_at: string | null;
  updated_at: string | null;
}

interface MemoryLog {
  _id: string;
  date: string;
  entries: string[];
  created_at: string | null;
  updated_at: string | null;
}

interface AgentMemoryViewerProps {
  token: string;
  activeSpace: any;
  onClose: () => void;
}

type TabType = 'facts' | 'logs';

export default function AgentMemoryViewer({ token, activeSpace, onClose }: AgentMemoryViewerProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [logs, setLogs] = useState<MemoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabType>('facts');

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

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeSpace?._id) params.append('space_id', activeSpace._id);
      params.append('limit', '14');
      const res = await fetch(`/memory-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load memory logs');
      const data = await res.json();
      setLogs(data);
    } catch {
      // Silently fail for logs -- they are supplementary
    } finally {
      setLogsLoading(false);
    }
  }, [token, activeSpace?._id]);

  useEffect(() => {
    fetchMemories();
    fetchLogs();
  }, [fetchMemories, fetchLogs]);

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
    const date = parseBackendDate(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = parseBackendDate(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(memories.map((m) => m.category || 'general'));
    return Array.from(cats).sort();
  }, [memories]);

  // Filter memories by search and category
  const filteredMemories = useMemo(() => {
    let result = memories;
    if (selectedCategory !== 'all') {
      result = result.filter((m) => (m.category || 'general') === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.key.toLowerCase().includes(q) ||
          m.value.toLowerCase().includes(q) ||
          (m.category || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [memories, selectedCategory, searchQuery]);

  // Group memories by category
  const groupedMemories = useMemo(() => {
    const groups: Record<string, Memory[]> = {};
    for (const m of filteredMemories) {
      const cat = m.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMemories]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-accent" />
          <h3 className="text-gray-100 text-lg font-semibold">Agent Memory</h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 transition-colors p-1"
          aria-label="Close memory viewer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-sm text-gray-400 mb-3 flex-shrink-0">
        Everything the assistant has learned about you. Delete anything you&apos;d like forgotten.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 flex-shrink-0 bg-gray-800/50 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('facts')}
          className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${
            activeTab === 'facts'
              ? 'bg-gray-700 text-gray-100'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Facts ({memories.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${
            activeTab === 'logs'
              ? 'bg-gray-700 text-gray-100'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Daily Logs ({logs.length})
        </button>
      </div>

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

      {activeTab === 'facts' && (
        <>
          {/* Search and filter bar */}
          <div className="flex gap-2 mb-3 flex-shrink-0">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
            {categories.length > 1 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-accent"
              >
                <option value="all">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Memory list grouped by category */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
            {loading && (
              <div className="text-gray-500 text-sm text-center py-8">Loading memories...</div>
            )}

            {!loading && filteredMemories.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">
                  {searchQuery || selectedCategory !== 'all' ? 'No matching memories' : 'No memories yet'}
                </p>
                {!searchQuery && selectedCategory === 'all' && (
                  <p className="text-gray-600 text-xs mt-1">
                    As you chat with the assistant, it will remember useful facts about you here.
                  </p>
                )}
              </div>
            )}

            {groupedMemories.map(([category, categoryMemories]) => (
              <div key={category}>
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-1.5 mb-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors w-full"
                >
                  {collapsedCategories.has(category) ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <Tag className="w-3 h-3" />
                  <span className="font-medium uppercase tracking-wide">
                    {category}
                  </span>
                  <span className="text-gray-600 ml-1">({categoryMemories.length})</span>
                </button>

                {!collapsedCategories.has(category) && (
                  <div className="space-y-1.5 ml-1">
                    {categoryMemories.map((memory) => (
                      <div
                        key={memory._id}
                        className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 group hover:border-gray-600 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-accent text-sm font-medium">{memory.key}</span>
                            </div>
                            <p className="text-gray-300 text-sm mt-0.5 break-words">{memory.value}</p>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              {memory.agent_id && memory.agent_id !== 'default' && (
                                <span className="text-gray-600 text-xs flex items-center gap-1">
                                  <Brain className="w-3 h-3" />
                                  {memory.agent_id}
                                </span>
                              )}
                              {memory.created_at && (
                                <span className="text-gray-600 text-xs flex items-center gap-1" title="Created">
                                  <Clock className="w-3 h-3" />
                                  created {formatDate(memory.created_at)}
                                </span>
                              )}
                              {memory.updated_at && memory.updated_at !== memory.created_at && (
                                <span className="text-gray-600 text-xs" title={`Updated ${formatDateTime(memory.updated_at)}`}>
                                  updated {formatDate(memory.updated_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDelete(memory._id)}
                            disabled={deletingId === memory._id}
                            className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 flex-shrink-0"
                            aria-label={`Delete memory: ${memory.key}`}
                          >
                            {deletingId === memory._id ? (
                              <span className="text-xs">...</span>
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'logs' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
          {logsLoading && (
            <div className="text-gray-500 text-sm text-center py-8">Loading logs...</div>
          )}

          {!logsLoading && logs.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No daily logs yet</p>
              <p className="text-gray-600 text-xs mt-1">
                Daily logs capture observations the assistant makes during conversations.
              </p>
            </div>
          )}

          {logs.map((log) => (
            <div
              key={log._id}
              className="bg-gray-800/50 border border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-accent text-sm font-medium">{log.date}</span>
                <span className="text-gray-600 text-xs">
                  {log.entries.length} {log.entries.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <ul className="space-y-1">
                {log.entries.map((entry, i) => (
                  <li key={i} className="text-gray-300 text-sm pl-3 relative before:content-['\2022'] before:absolute before:left-0 before:text-gray-600">
                    {entry}
                  </li>
                ))}
              </ul>
              {log.updated_at && (
                <p className="text-gray-600 text-xs mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  last updated {formatDateTime(log.updated_at)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
