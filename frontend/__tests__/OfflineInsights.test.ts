import makeServiceWorkerEnv from 'service-worker-mock';
import { IDBFactory } from 'fake-indexeddb';

beforeEach(() => {
  const env = makeServiceWorkerEnv();
  Object.defineProperty(global, 'navigator', { value: env.navigator, configurable: true });
  (global as any).self = env;
  (global as any).indexedDB = new IDBFactory();
  (global as any).caches = env.caches;
  if (!(global as any).structuredClone) {
    (global as any).structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
  }
  jest.resetModules();
});

describe('Offline Insights Functionality', () => {
  test('generates insights from offline todos', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Clear any existing todos to ensure clean test state
    await sw.clearTodos('user1');

    const todos = [
      {
        _id: 'todo1',
        text: 'Complete project',
        category: 'Work',
        priority: 'High',
        dateAdded: '2023-12-01T10:00:00Z',
        completed: true,
        dateCompleted: '2023-12-01T15:00:00Z',
        user_id: 'user1',
        space_id: 'space123'
      },
      {
        _id: 'todo2',
        text: 'Buy groceries',
        category: 'Personal',
        priority: 'Medium',
        dateAdded: '2023-12-02T09:00:00Z',
        completed: false,
        user_id: 'user1',
        space_id: 'space123'
      },
      {
        _id: 'todo3',
        text: 'Exercise',
        category: 'Health',
        priority: 'Low',
        dateAdded: '2023-12-03T07:00:00Z',
        completed: true,
        dateCompleted: '2023-12-03T08:00:00Z',
        user_id: 'user1',
        space_id: 'space123'
      }
    ];

    // Store todos offline
    for (const todo of todos) {
      await sw.putTodo(todo, 'user1');
    }

    // Test offline insights request
    const request = new Request('/insights?space_id=space123', {
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response = await sw.handleRequest(request);
    expect(response.status).toBe(200);

    const insights = await response.json();

    // Verify overview stats
    expect(insights.overview.total_tasks).toBe(3);
    expect(insights.overview.completed_tasks).toBe(2);
    expect(insights.overview.pending_tasks).toBe(1);
    expect(insights.overview.completion_rate).toBeCloseTo(66.7, 1);

    // Verify category breakdown
    expect(insights.category_breakdown).toHaveLength(3);
    const workCategory = insights.category_breakdown.find(c => c.category === 'Work');
    expect(workCategory).toMatchObject({
      category: 'Work',
      total: 1,
      completed: 1,
      completion_rate: 100
    });

    // Verify priority breakdown
    expect(insights.priority_breakdown).toHaveLength(3);
    const highPriority = insights.priority_breakdown.find(p => p.priority === 'High');
    expect(highPriority).toMatchObject({
      priority: 'High',
      total: 1,
      completed: 1,
      completion_rate: 100
    });

    // Verify weekly stats
    expect(insights.weekly_stats.length).toBeGreaterThan(0);
  });

  test('handles empty todo list for insights', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Clear any existing todos to ensure clean test state
    await sw.clearTodos('user1');

    const request = new Request('/api/insights', {
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response = await sw.handleRequest(request);
    expect(response.status).toBe(200);

    const insights = await response.json();

    expect(insights.overview).toMatchObject({
      total_tasks: 0,
      completed_tasks: 0,
      pending_tasks: 0,
      completion_rate: 0
    });

    expect(insights.weekly_stats).toEqual([]);
    expect(insights.category_breakdown).toEqual([]);
    expect(insights.priority_breakdown).toEqual([]);
  });

  test('filters insights by space_id', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Clear any existing todos to ensure clean test state
    await sw.clearTodos('user1');

    const todos = [
      {
        _id: 'todo1',
        text: 'Work task',
        category: 'Work',
        priority: 'High',
        dateAdded: '2023-12-01T10:00:00Z',
        completed: true,
        user_id: 'user1',
        space_id: 'space1'
      },
      {
        _id: 'todo2',
        text: 'Personal task',
        category: 'Personal',
        priority: 'Medium',
        dateAdded: '2023-12-02T09:00:00Z',
        completed: false,
        user_id: 'user1',
        space_id: 'space2'
      }
    ];

    for (const todo of todos) {
      await sw.putTodo(todo, 'user1');
    }

    // Request insights for space1 only
    const request = new Request('/insights?space_id=space1', {
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response = await sw.handleRequest(request);
    const insights = await response.json();

    // Should only include todo from space1
    expect(insights.overview.total_tasks).toBe(1);
    expect(insights.category_breakdown).toHaveLength(1);
    expect(insights.category_breakdown[0].category).toBe('Work');
  });

  test('maintains user isolation for insights', async () => {
    const sw = require('../public/sw.js');

    // Clear any existing todos to ensure clean test state
    await sw.clearTodos('user1');
    await sw.clearTodos('user2');

    const user1Todo = {
      _id: 'todo_user1',
      text: 'User 1 task',
      category: 'Work',
      priority: 'High',
      dateAdded: '2023-12-01T10:00:00Z',
      completed: true,
      user_id: 'user1',
      space_id: 'space123'
    };

    const user2Todo = {
      _id: 'todo_user2',
      text: 'User 2 task',
      category: 'Personal',
      priority: 'Medium',
      dateAdded: '2023-12-01T11:00:00Z',
      completed: false,
      user_id: 'user2',
      space_id: 'space123'
    };

    await sw.putTodo(user1Todo, 'user1');
    await sw.putTodo(user2Todo, 'user2');

    // Test user1 insights
    await sw.putAuth('token123', 'user1');
    const request1 = new Request('/api/insights', {
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response1 = await sw.handleRequest(request1);
    const insights1 = await response1.json();

    expect(insights1.overview.total_tasks).toBe(1);
    expect(insights1.category_breakdown[0].category).toBe('Work');

    // Test user2 insights
    await sw.putAuth('token456', 'user2');
    const request2 = new Request('/api/insights', {
      headers: { 'Authorization': 'Bearer token456' }
    });

    // Need to mock the auth for user2
    jest.spyOn(sw, 'getAuth').mockResolvedValueOnce({ token: 'token456', userId: 'user2' });

    const response2 = await sw.handleRequest(request2);
    const insights2 = await response2.json();

    expect(insights2.overview.total_tasks).toBe(1);
    expect(insights2.category_breakdown[0].category).toBe('Personal');
  });

  test('calculates weekly stats correctly', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Clear any existing todos to ensure clean test state
    await sw.clearTodos('user1');

    // Create todos across different weeks
    const todos = [
      {
        _id: 'todo1',
        text: 'Week 1 task',
        category: 'Work',
        priority: 'High',
        dateAdded: '2023-12-04T10:00:00Z', // Monday Week 1
        completed: true,
        dateCompleted: '2023-12-04T15:00:00Z',
        user_id: 'user1'
      },
      {
        _id: 'todo2',
        text: 'Week 1 task 2',
        category: 'Work',
        priority: 'Medium',
        dateAdded: '2023-12-05T09:00:00Z', // Tuesday Week 1
        completed: false,
        user_id: 'user1'
      },
      {
        _id: 'todo3',
        text: 'Week 2 task',
        category: 'Personal',
        priority: 'Low',
        dateAdded: '2023-12-11T07:00:00Z', // Monday Week 2
        completed: true,
        dateCompleted: '2023-12-12T08:00:00Z',
        user_id: 'user1'
      }
    ];

    for (const todo of todos) {
      await sw.putTodo(todo, 'user1');
    }

    const request = new Request('/api/insights', {
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response = await sw.handleRequest(request);
    const insights = await response.json();

    // Should have 2 weeks of data
    expect(insights.weekly_stats).toHaveLength(2);

    // Week 1: 2 created, 1 completed
    const week1 = insights.weekly_stats.find(w => w.week === '2023-12-04');
    expect(week1).toMatchObject({
      week: '2023-12-04',
      created: 2,
      completed: 1
    });

    // Week 2: 1 created, 1 completed
    const week2 = insights.weekly_stats.find(w => w.week === '2023-12-11');
    expect(week2).toMatchObject({
      week: '2023-12-11',
      created: 1,
      completed: 1
    });
  });
});
