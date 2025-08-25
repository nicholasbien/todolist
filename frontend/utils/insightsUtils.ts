// Shared insights calculation utility
// This eliminates duplication between online (backend) and offline (service worker) insights generation
// Compatible with both TypeScript and JavaScript environments

export interface Todo {
  _id: string;
  text: string;
  category: string;
  priority: string;
  dateAdded: string;
  dateCompleted?: string;
  completed: boolean;
  user_id: string;
  space_id?: string;
  dueDate?: string;
  notes?: string;
}

export interface WeeklyData {
  week: string;
  created: number;
  completed: number;
}

export interface CategoryData {
  category: string;
  total: number;
  completed: number;
  completion_rate: number;
}

export interface PriorityData {
  priority: string;
  total: number;
  completed: number;
  completion_rate: number;
}

export interface InsightsData {
  overview: {
    total_tasks: number;
    completed_tasks: number;
    pending_tasks: number;
    completion_rate: number;
  };
  weekly_stats: WeeklyData[];
  category_breakdown: CategoryData[];
  priority_breakdown: PriorityData[];
}

export function getWeekKey(dateString: string | Date): string | null {
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return null;

    const weekStart = new Date(date);
    const day = weekStart.getUTCDay();
    const diff = (day + 6) % 7; // Monday as start of week
    weekStart.setUTCDate(weekStart.getUTCDate() - diff);
    return weekStart.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

export function generateInsights(todos: Todo[]): InsightsData {
  // Convert todos to consistent format
  const todoArray = Array.isArray(todos) ? todos : Object.values(todos) as Todo[];

  // Calculate basic stats
  const totalTasks = todoArray.length;
  const completedTasks = todoArray.filter(todo => todo.completed).length;
  const pendingTasks = totalTasks - completedTasks;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100) : 0;

  // Weekly stats tracking
  const weeklyStats: Record<string, { created: number; completed: number }> = {};

  // Category stats tracking
  const categoryStats: Record<string, { total: number; completed: number }> = {};

  // Priority stats tracking
  const priorityStats: Record<string, { total: number; completed: number }> = {};

  // Process each todo
  for (const todo of todoArray) {
    // Parse dateAdded for weekly creation stats
    if (todo.dateAdded) {
      const weekKey = getWeekKey(todo.dateAdded);
      if (weekKey) {
        if (!weeklyStats[weekKey]) {
          weeklyStats[weekKey] = { created: 0, completed: 0 };
        }
        weeklyStats[weekKey].created += 1;
      }
    }

    // Parse dateCompleted for weekly completion stats
    if (todo.completed && todo.dateCompleted) {
      const weekKey = getWeekKey(todo.dateCompleted);
      if (weekKey) {
        if (!weeklyStats[weekKey]) {
          weeklyStats[weekKey] = { created: 0, completed: 0 };
        }
        weeklyStats[weekKey].completed += 1;
      }
    }

    // Category stats
    const category = todo.category || 'General';
    if (!categoryStats[category]) {
      categoryStats[category] = { total: 0, completed: 0 };
    }
    categoryStats[category].total += 1;
    if (todo.completed) {
      categoryStats[category].completed += 1;
    }

    // Priority stats
    const priority = todo.priority || 'Medium';
    if (!priorityStats[priority]) {
      priorityStats[priority] = { total: 0, completed: 0 };
    }
    priorityStats[priority].total += 1;
    if (todo.completed) {
      priorityStats[priority].completed += 1;
    }
  }

  // Convert weekly stats to sorted array
  const weeklyData: WeeklyData[] = Object.keys(weeklyStats)
    .sort()
    .map(week => ({
      week,
      created: weeklyStats[week].created,
      completed: weeklyStats[week].completed
    }));

  // Convert category stats to array
  const categoryData: CategoryData[] = Object.entries(categoryStats).map(([category, stats]) => {
    const completionRate = stats.total > 0 ? (stats.completed / stats.total * 100) : 0;
    return {
      category,
      total: stats.total,
      completed: stats.completed,
      completion_rate: Math.round(completionRate * 10) / 10
    };
  });

  // Convert priority stats to array
  const priorityData: PriorityData[] = Object.entries(priorityStats).map(([priority, stats]) => {
    const completionRate = stats.total > 0 ? (stats.completed / stats.total * 100) : 0;
    return {
      priority,
      total: stats.total,
      completed: stats.completed,
      completion_rate: Math.round(completionRate * 10) / 10
    };
  });

  return {
    overview: {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      pending_tasks: pendingTasks,
      completion_rate: Math.round(completionRate * 10) / 10
    },
    weekly_stats: weeklyData,
    category_breakdown: categoryData,
    priority_breakdown: priorityData
  };
}
