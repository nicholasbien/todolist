import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface InsightsProps {
  token: string;
  activeSpace: any;
}

interface WeeklyData {
  week: string;
  created: number;
  completed: number;
}

interface CategoryData {
  category: string;
  total: number;
  completed: number;
  completion_rate: number;
}

interface PriorityData {
  priority: string;
  total: number;
  completed: number;
  completion_rate: number;
}

interface OverviewData {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  completion_rate: number;
}

interface InsightsData {
  overview: OverviewData;
  weekly_stats: WeeklyData[];
  category_breakdown: CategoryData[];
  priority_breakdown: PriorityData[];
}

export default function InsightsComponent({ token, activeSpace }: InsightsProps) {
  const { authenticatedFetch } = useAuth();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const url = activeSpace?._id ? `/insights?space_id=${activeSpace._id}` : '/insights';
      const response = await authenticatedFetch(url);

      if (!response?.ok) {
        throw new Error('Failed to fetch insights');
      }

      const data = await response.json();
      setInsights(data);
    } catch (err: any) {
      setError(err.message || 'Error loading insights');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, activeSpace]);

  useEffect(() => {
    if (authenticatedFetch) {
      fetchInsights();
    }
  }, [fetchInsights, authenticatedFetch]);

  const formatWeekLabel = (weekString: string) => {
    const date = new Date(weekString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getMaxValue = (data: WeeklyData[]) => {
    return Math.max(...data.flatMap(d => [d.created, d.completed]), 1);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4 text-4xl">📊</div>
        <p className="text-gray-400">Loading insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4 text-4xl">⚠️</div>
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchInsights}
          className="mt-4 px-4 py-2 bg-accent text-foreground rounded-lg hover:bg-accent-light transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4 text-4xl">📊</div>
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  const maxWeeklyValue = getMaxValue(insights.weekly_stats);

  return (
    <div className="space-y-8">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 min-h-[80px] flex flex-col text-center">
          <div className="text-2xl font-bold text-accent">{insights.overview.total_tasks}</div>
          <div className="text-xs text-gray-400 leading-tight">Total Tasks</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 min-h-[80px] flex flex-col text-center">
          <div className="text-2xl font-bold text-green-400">{insights.overview.completed_tasks}</div>
          <div className="text-xs text-gray-400 leading-tight">Completed Tasks</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 min-h-[80px] flex flex-col text-center">
          <div className="text-2xl font-bold text-yellow-400">{insights.overview.pending_tasks}</div>
          <div className="text-xs text-gray-400 leading-tight">Pending Tasks</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 min-h-[80px] flex flex-col text-center">
          <div className="text-2xl font-bold text-purple-400">{Math.round(insights.overview.completion_rate)}%</div>
          <div className="text-xs text-gray-400 leading-tight">Completion Rate</div>
        </div>
      </div>

      {/* Tasks Per Week Chart */}
      {insights.weekly_stats.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Tasks Per Week</h3>
          <div className="space-y-2">
            {insights.weekly_stats.map((week, index) => (
              <div key={week.week} className="flex items-center space-x-3">
                <div className="w-20 text-xs text-gray-400 text-right">
                  {formatWeekLabel(week.week)}
                </div>
                <div className="flex-1 flex space-x-1">
                  {/* Created bar */}
                  <div className="flex-1">
                    <div
                      className="bg-accent h-4 rounded"
                      style={{
                        width: `${(week.created / maxWeeklyValue) * 100}%`,
                        minWidth: week.created > 0 ? '8px' : '0'
                      }}
                    />
                  </div>
                  {/* Completed bar */}
                  <div className="flex-1">
                    <div
                      className="bg-green-600 h-4 rounded"
                      style={{
                        width: `${(week.completed / maxWeeklyValue) * 100}%`,
                        minWidth: week.completed > 0 ? '8px' : '0'
                      }}
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-400 w-12">
                  {week.created}+ {week.completed}✓
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center space-x-6 mt-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-accent rounded"></div>
              <span className="text-gray-400">Created</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-600 rounded"></div>
              <span className="text-gray-400">Completed</span>
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {insights.category_breakdown.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Tasks by Category</h3>
          <div className="space-y-3">
            {insights.category_breakdown
              .sort((a, b) => b.total - a.total)
              .map((category) => (
              <div key={category.category} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-gray-100 font-medium">{category.category}</div>
                  <div className="text-sm text-gray-400">
                    {category.completed}/{category.total}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-24 bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-accent h-2 rounded-full"
                      style={{ width: `${category.completion_rate}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-400 w-12">
                    {Math.round(category.completion_rate)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priority Breakdown */}
      {insights.priority_breakdown.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Tasks by Priority</h3>
          <div className="space-y-3">
            {insights.priority_breakdown
              .sort((a, b) => {
                const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
                return (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) -
                       (priorityOrder[a.priority as keyof typeof priorityOrder] || 0);
              })
              .map((priority) => (
              <div key={priority.priority} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`text-gray-100 font-medium ${
                    priority.priority === 'High' ? 'text-red-400' :
                    priority.priority === 'Medium' ? 'text-yellow-400' :
                    'text-gray-400'
                  }`}>
                    {priority.priority}
                  </div>
                  <div className="text-sm text-gray-400">
                    {priority.completed}/{priority.total}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-24 bg-gray-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        priority.priority === 'High' ? 'bg-red-500' :
                        priority.priority === 'Medium' ? 'bg-yellow-500' :
                        'bg-gray-500'
                      }`}
                      style={{ width: `${priority.completion_rate}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-400 w-12">
                    {Math.round(priority.completion_rate)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {insights.overview.total_tasks === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4 text-4xl">📝</div>
          <h3 className="text-lg font-semibold text-gray-100 mb-2">No Tasks Yet</h3>
          <p className="text-gray-400">Start adding tasks to see your insights and analytics!</p>
        </div>
      )}
    </div>
  );
}
