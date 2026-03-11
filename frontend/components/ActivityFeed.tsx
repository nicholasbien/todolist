import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  PlusCircle,
  MessageSquare,
  Bot,
  BookOpen,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ActivityEvent {
  type: 'task_created' | 'task_completed' | 'message_user' | 'message_agent' | 'journal_entry';
  timestamp: string;
  title: string;
  detail: string;
  category?: string;
  priority?: string;
  todo_id?: string;
  session_id?: string;
  agent_id?: string;
  journal_id?: string;
  date?: string;
}

interface ActivityFeedProps {
  activeSpace: any;
  token: string;
  isActive: boolean;
  onOpenTaskChat?: (todoId: string) => void;
}

function formatRelativeTime(isoString: string): string {
  const normalizedTimestamp = isoString.replace(/\.(\d{3})\d*/, '.$1');
  const date = new Date(normalizedTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullTime(isoString: string): string {
  const normalizedTimestamp = isoString.replace(/\.(\d{3})\d*/, '.$1');
  const date = new Date(normalizedTimestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function groupByDate(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const groups = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const normalizedTimestamp = event.timestamp.replace(/\.(\d{3})\d*/, '.$1');
    const date = new Date(normalizedTimestamp);
    const key = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  }
  return groups;
}

const eventConfig: Record<string, { icon: typeof CheckCircle2; color: string; bgColor: string }> = {
  task_created: { icon: PlusCircle, color: 'text-blue-400', bgColor: 'bg-blue-400/10' },
  task_completed: { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-400/10' },
  message_user: { icon: MessageSquare, color: 'text-gray-400', bgColor: 'bg-gray-400/10' },
  message_agent: { icon: Bot, color: 'text-purple-400', bgColor: 'bg-purple-400/10' },
  journal_entry: { icon: BookOpen, color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
};

export default function ActivityFeed({ activeSpace, token, isActive, onOpenTaskChat }: ActivityFeedProps) {
  const { authenticatedFetch } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  const fetchEvents = useCallback(async (before?: string) => {
    if (!authenticatedFetch) return;

    const isLoadMore = !!before;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const params = new URLSearchParams();
      if (activeSpace?._id) params.set('space_id', activeSpace._id);
      params.set('limit', '50');
      if (before) params.set('before', before);

      const response = await authenticatedFetch(`/activity-feed?${params.toString()}`);
      if (!response?.ok) throw new Error('Failed to fetch activity feed');

      const data: ActivityEvent[] = await response.json();

      if (isLoadMore) {
        setEvents(prev => [...prev, ...data]);
      } else {
        setEvents(data);
      }
      setHasMore(data.length >= 50);
    } catch (err: any) {
      setError(err.message || 'Error loading activity feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [authenticatedFetch, activeSpace?._id]);

  // Fetch on first mount / tab activation
  useEffect(() => {
    if (isActive && !hasFetched.current) {
      hasFetched.current = true;
      fetchEvents();
    }
  }, [isActive, fetchEvents]);

  // Re-fetch when space changes
  useEffect(() => {
    if (isActive) {
      hasFetched.current = true;
      fetchEvents();
    } else {
      hasFetched.current = false;
    }
  }, [activeSpace?._id]);

  const handleLoadMore = () => {
    if (events.length > 0 && hasMore && !loadingMore) {
      const lastTimestamp = events[events.length - 1].timestamp;
      fetchEvents(lastTimestamp);
    }
  };

  const handleRefresh = () => {
    setEvents([]);
    setHasMore(true);
    fetchEvents();
  };

  const grouped = groupByDate(events);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4" style={{ flexShrink: 0 }}>
        <h2 className="text-lg font-semibold text-gray-100">Activity</h2>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          aria-label="Refresh activity feed"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ minHeight: 0 }}
      >
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading activity...
          </div>
        ) : error && events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-2 text-sm text-accent hover:underline"
            >
              Try again
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Clock size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No activity yet</p>
            <p className="text-xs text-gray-600 mt-1">Create tasks or write in your journal to see activity here.</p>
          </div>
        ) : (
          <div className="space-y-6 pb-4">
            {Array.from(grouped.entries()).map(([dateLabel, dayEvents]) => (
              <div key={dateLabel}>
                {/* Date header */}
                <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-sm py-2 mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {dateLabel}
                  </span>
                </div>

                {/* Events for this day */}
                <div className="space-y-1">
                  {dayEvents.map((event, i) => {
                    const config = eventConfig[event.type] || eventConfig.task_created;
                    const Icon = config.icon;

                    return (
                      <div
                        key={`${event.type}-${event.timestamp}-${i}`}
                        className={`flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-900/50 transition-colors ${
                          event.todo_id && onOpenTaskChat ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => {
                          if (event.todo_id && onOpenTaskChat) {
                            onOpenTaskChat(event.todo_id);
                          }
                        }}
                      >
                        {/* Icon */}
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.bgColor}`}>
                          <Icon size={14} className={config.color} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm text-gray-200 font-medium truncate">
                              {event.title}
                            </span>
                            {event.category && event.type.startsWith('task_') && (
                              <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded flex-shrink-0">
                                {event.category}
                              </span>
                            )}
                          </div>
                          {event.detail && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {event.detail}
                            </p>
                          )}
                          {event.agent_id && (
                            <span className="text-[10px] text-purple-400/70 mt-0.5 inline-block">
                              via {event.agent_id}
                            </span>
                          )}
                        </div>

                        {/* Timestamp */}
                        <span
                          className="text-[11px] text-gray-600 flex-shrink-0 mt-0.5"
                          title={formatFullTime(event.timestamp)}
                        >
                          {formatRelativeTime(event.timestamp)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
