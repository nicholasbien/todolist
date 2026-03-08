import React from 'react';
import { render, screen } from '@testing-library/react';
import TodoItem from '../components/TodoItem';

const baseProps = {
  categories: ['General', 'Work'],
  editingCategory: null,
  setEditingCategory: jest.fn(),
  handleUpdateCategory: jest.fn(),
  handleUpdatePriority: jest.fn(),
  handleCompleteTodo: jest.fn(),
  handleDeleteTodo: jest.fn(),
  isCollaborative: false,
  onEdit: jest.fn(),
  onChat: jest.fn(),
};

const baseTodo = {
  _id: 'todo-1',
  text: 'Write tests',
  category: 'General',
  priority: 'Medium',
  completed: false,
};

describe('TodoItem creator type indicator', () => {
  test('shows assistant indicator for agent-created tasks', () => {
    render(
      <TodoItem
        {...baseProps}
        todo={{ ...baseTodo, creator_type: 'agent' }}
      />
    );

    expect(screen.getByLabelText('Created by assistant')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  test('defaults to user indicator when creator_type is missing', () => {
    render(
      <TodoItem
        {...baseProps}
        todo={baseTodo}
      />
    );

    expect(screen.getByLabelText('Created by you')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });
});
