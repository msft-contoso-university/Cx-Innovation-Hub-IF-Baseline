import { describe, expect, it } from 'vitest';

import { loadRouter, respondInOrder } from '../support/routeHarness.js';

const TASK_ROW = { id: 't-1', title: 'Ship it', status: 'todo', position: 0 };
const TASK_WITH_USER = { ...TASK_ROW, assigned_user_name: 'Ada', assigned_user_avatar_color: '#fff' };

describe('POST /projects/:projectId/tasks', () => {
  it('rejects a whitespace-only title without touching the database', async () => {
    // Arrange
    const router = loadRouter('tasks', respondInOrder([]));

    // Act
    const result = await router.invoke('post', '/projects/:projectId/tasks', {
      params: { projectId: 'p-1' },
      body: { title: '   ' },
    });

    // Assert
    expect(result.error.status).toBe(400);
    expect(result.error.message).toBe('Task title is required');
    expect(result.queries).toHaveLength(0);
  });

  it('trims the title, defaults optional fields and uses the next todo position', async () => {
    // Arrange
    const router = loadRouter(
      'tasks',
      respondInOrder([
        { rows: [{ next_pos: 7 }] },
        { rows: [TASK_ROW] },
        { rows: [TASK_WITH_USER] },
      ])
    );

    // Act
    const result = await router.invoke('post', '/projects/:projectId/tasks', {
      params: { projectId: 'p-1' },
      body: { title: '  Ship it  ' },
    });

    // Assert
    expect(result.status).toBe(201);
    expect(result.body).toEqual(TASK_WITH_USER);
    expect(result.queries[1].params).toEqual(['p-1', 'Ship it', null, 7, null]);
  });
});

describe('PUT /tasks/:id', () => {
  it('returns 404 when the task does not exist', async () => {
    // Arrange
    const router = loadRouter('tasks', respondInOrder([{ rows: [] }]));

    // Act
    const result = await router.invoke('put', '/tasks/:id', {
      params: { id: 'missing' },
      body: { title: 'New title' },
    });

    // Assert
    expect(result.error.status).toBe(404);
    expect(result.error.message).toBe('Task not found');
  });

  it('stores a null description when none is supplied', async () => {
    // Arrange
    const router = loadRouter(
      'tasks',
      respondInOrder([{ rows: [TASK_ROW] }, { rows: [TASK_WITH_USER] }])
    );

    // Act
    const result = await router.invoke('put', '/tasks/:id', {
      params: { id: 't-1' },
      body: { title: 'New title' },
    });

    // Assert
    expect(result.status).toBe(200);
    expect(result.queries[0].params).toEqual(['New title', null, 't-1']);
  });
});

describe('PATCH /tasks/:id/status', () => {
  it.each(['archived', '', 'TODO', undefined])(
    'rejects the invalid status %s',
    async (status) => {
      // Arrange
      const router = loadRouter('tasks', respondInOrder([]));

      // Act
      const result = await router.invoke('patch', '/tasks/:id/status', {
        params: { id: 't-1' },
        body: { status, position: 1 },
      });

      // Assert
      expect(result.error.status).toBe(400);
      expect(result.error.message).toContain('Invalid status');
      expect(result.queries).toHaveLength(0);
    }
  );

  it.each(['todo', 'in_progress', 'in_review', 'done'])(
    'accepts the valid status %s',
    async (status) => {
      // Arrange
      const router = loadRouter(
        'tasks',
        respondInOrder([{ rows: [TASK_ROW] }, { rows: [TASK_WITH_USER] }])
      );

      // Act
      const result = await router.invoke('patch', '/tasks/:id/status', {
        params: { id: 't-1' },
        body: { status, position: 2 },
      });

      // Assert
      expect(result.error).toBeUndefined();
      expect(result.queries[0].params).toEqual([status, 2, 't-1']);
    }
  );

  it('accepts position 0 as the first slot in a column', async () => {
    // Arrange
    const router = loadRouter(
      'tasks',
      respondInOrder([{ rows: [TASK_ROW] }, { rows: [TASK_WITH_USER] }])
    );

    // Act
    const result = await router.invoke('patch', '/tasks/:id/status', {
      params: { id: 't-1' },
      body: { status: 'done', position: 0 },
    });

    // Assert
    expect(result.error).toBeUndefined();
    expect(result.queries[0].params).toEqual(['done', 0, 't-1']);
  });

  it('rejects a missing position', async () => {
    // Arrange
    const router = loadRouter('tasks', respondInOrder([]));

    // Act
    const result = await router.invoke('patch', '/tasks/:id/status', {
      params: { id: 't-1' },
      body: { status: 'done' },
    });

    // Assert
    expect(result.error.status).toBe(400);
    expect(result.error.message).toBe('Position is required');
    expect(result.queries).toHaveLength(0);
  });
});

describe('PATCH /tasks/:id/assign', () => {
  it('unassigns the task when assigned_user_id is omitted', async () => {
    // Arrange
    const router = loadRouter(
      'tasks',
      respondInOrder([{ rows: [TASK_ROW] }, { rows: [TASK_WITH_USER] }])
    );

    // Act
    const result = await router.invoke('patch', '/tasks/:id/assign', {
      params: { id: 't-1' },
      body: {},
    });

    // Assert
    expect(result.queries[0].params).toEqual([null, 't-1']);
    expect(result.body).toEqual(TASK_WITH_USER);
  });

  it('returns 404 when the task does not exist', async () => {
    // Arrange
    const router = loadRouter('tasks', respondInOrder([{ rows: [] }]));

    // Act
    const result = await router.invoke('patch', '/tasks/:id/assign', {
      params: { id: 'missing' },
      body: { assigned_user_id: 'u-1' },
    });

    // Assert
    expect(result.error.status).toBe(404);
  });
});

describe('DELETE /tasks/:id', () => {
  it('returns the deleted id', async () => {
    // Arrange
    const router = loadRouter('tasks', respondInOrder([{ rows: [{ id: 't-1' }] }]));

    // Act
    const result = await router.invoke('delete', '/tasks/:id', { params: { id: 't-1' } });

    // Assert
    expect(result.body).toEqual({ message: 'Task deleted', id: 't-1' });
  });

  it('returns 404 when nothing was deleted', async () => {
    // Arrange
    const router = loadRouter('tasks', respondInOrder([{ rows: [] }]));

    // Act
    const result = await router.invoke('delete', '/tasks/:id', { params: { id: 'missing' } });

    // Assert
    expect(result.error.status).toBe(404);
    expect(result.error.message).toBe('Task not found');
  });
});

describe('GET /projects/:projectId/tasks', () => {
  it('forwards database failures to the error middleware', async () => {
    // Arrange
    const router = loadRouter('tasks', () => {
      throw new Error('connection terminated');
    });

    // Act
    const result = await router.invoke('get', '/projects/:projectId/tasks', {
      params: { projectId: 'p-1' },
    });

    // Assert
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('connection terminated');
    expect(result.body).toBeUndefined();
  });
});
