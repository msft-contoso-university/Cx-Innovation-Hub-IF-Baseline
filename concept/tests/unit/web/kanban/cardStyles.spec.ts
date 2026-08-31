import { describe, it, expect } from 'vitest';
import { getCardClassName, isTaskAssignedToUser } from '../../../../apps/web/src/components/kanban/cardStyles';
import type { Task } from '../../../../apps/web/src/api/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    project_id: 'project-1',
    title: 'Sample task',
    description: null,
    status: 'todo',
    position: 0,
    assigned_user_id: null,
    assigned_user_name: null,
    assigned_user_avatar_color: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isTaskAssignedToUser', () => {
  it('returns true when the task is assigned to the current user', () => {
    // Arrange
    const task = makeTask({ assigned_user_id: 'user-1' });

    // Act
    const result = isTaskAssignedToUser(task, 'user-1');

    // Assert
    expect(result).toBe(true);
  });

  it('returns false when the task is assigned to a different user', () => {
    // Arrange
    const task = makeTask({ assigned_user_id: 'user-2' });

    // Act
    const result = isTaskAssignedToUser(task, 'user-1');

    // Assert
    expect(result).toBe(false);
  });

  it('returns false when the task is unassigned', () => {
    // Arrange
    const task = makeTask({ assigned_user_id: null });

    // Act
    const result = isTaskAssignedToUser(task, 'user-1');

    // Assert
    expect(result).toBe(false);
  });

  it('returns false when there is no current user id', () => {
    // Arrange
    const task = makeTask({ assigned_user_id: null });

    // Act
    const result = isTaskAssignedToUser(task, '');

    // Assert
    expect(result).toBe(false);
  });
});

describe('getCardClassName', () => {
  it('prioritizes the dragging style even when assigned to the current user', () => {
    // Arrange
    const options = { isDragging: true, isAssignedToCurrentUser: true };

    // Act
    const className = getCardClassName(options);

    // Assert
    expect(className).toBe('shadow-lg border-blue-300');
  });

  it('applies the ownership highlight style when assigned and not dragging', () => {
    // Arrange
    const options = { isDragging: false, isAssignedToCurrentUser: true };

    // Act
    const className = getCardClassName(options);

    // Assert
    expect(className).toBe('border-blue-300 ring-2 ring-blue-200 hover:shadow-md');
  });

  it('applies the default style when not dragging and not assigned', () => {
    // Arrange
    const options = { isDragging: false, isAssignedToCurrentUser: false };

    // Act
    const className = getCardClassName(options);

    // Assert
    expect(className).toBe('border-gray-200 hover:shadow-md');
  });
});
