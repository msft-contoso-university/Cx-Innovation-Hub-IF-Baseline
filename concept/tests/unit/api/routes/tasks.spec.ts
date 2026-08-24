import { describe, expect, it } from 'vitest';

import { loadRouter, type QueryMock } from './routeHarness';

function queryQueue(responses: Array<{ rows: unknown[] }>): QueryMock {
  const queue = [...responses];
  return async () => queue.shift() ?? { rows: [] };
}

describe('tasks routes', () => {
  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a missing title with 400 and does not touch the database', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([]));

      // Act
      const { error } = await harness.call('POST', '/projects/:projectId/tasks', {
        params: { projectId: '1' },
        body: { description: 'no title' },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(error?.message).toBe('Task title is required');
      expect(harness.queries).toHaveLength(0);
    });

    it('rejects a whitespace-only title with 400', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([]));

      // Act
      const { error } = await harness.call('POST', '/projects/:projectId/tasks', {
        params: { projectId: '1' },
        body: { title: '   ' },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(harness.queries).toHaveLength(0);
    });

    it('trims the title, appends to the end of the todo column and returns 201', async () => {
      // Arrange
      const created = { id: 7 };
      const hydrated = { id: 7, title: 'Write tests', status: 'todo' };
      const harness = loadRouter(
        'tasks.js',
        queryQueue([{ rows: [{ next_pos: 4 }] }, { rows: [created] }, { rows: [hydrated] }])
      );

      // Act
      const { res, error } = await harness.call('POST', '/projects/:projectId/tasks', {
        params: { projectId: '3' },
        body: { title: '  Write tests  ', description: undefined },
      });

      // Assert
      expect(error).toBeUndefined();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(hydrated);
      expect(harness.queries[1].params).toEqual(['3', 'Write tests', null, 4, null]);
    });
  });

  describe('PUT /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([{ rows: [] }]));

      // Act
      const { error } = await harness.call('PUT', '/tasks/:id', {
        params: { id: '99' },
        body: { title: 'Renamed' },
      });

      // Assert
      expect(error?.status).toBe(404);
      expect(error?.message).toBe('Task not found');
    });

    it('rejects an empty title with 400 before updating', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([]));

      // Act
      const { error } = await harness.call('PUT', '/tasks/:id', {
        params: { id: '1' },
        body: { title: '' },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(harness.queries).toHaveLength(0);
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it.each(['backlog', '', 'DONE', undefined])(
      'rejects invalid status %s with 400',
      async (status) => {
        // Arrange
        const harness = loadRouter('tasks.js', queryQueue([]));

        // Act
        const { error } = await harness.call('PATCH', '/tasks/:id/status', {
          params: { id: '1' },
          body: { status, position: 0 },
        });

        // Assert
        expect(error?.status).toBe(400);
        expect(harness.queries).toHaveLength(0);
      }
    );

    it.each(['todo', 'in_progress', 'in_review', 'done'])(
      'accepts valid status %s',
      async (status) => {
        // Arrange
        const hydrated = { id: 1, status };
        const harness = loadRouter(
          'tasks.js',
          queryQueue([{ rows: [{ id: 1 }] }, { rows: [hydrated] }])
        );

        // Act
        const { res, error } = await harness.call('PATCH', '/tasks/:id/status', {
          params: { id: '1' },
          body: { status, position: 2 },
        });

        // Assert
        expect(error).toBeUndefined();
        expect(res.body).toEqual(hydrated);
      }
    );

    it('accepts position 0 as a valid boundary value', async () => {
      // Arrange
      const harness = loadRouter(
        'tasks.js',
        queryQueue([{ rows: [{ id: 1 }] }, { rows: [{ id: 1, position: 0 }] }])
      );

      // Act
      const { error } = await harness.call('PATCH', '/tasks/:id/status', {
        params: { id: '1' },
        body: { status: 'done', position: 0 },
      });

      // Assert
      expect(error).toBeUndefined();
      expect(harness.queries[0].params).toEqual(['done', 0, '1']);
    });

    it('rejects a missing position with 400', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([]));

      // Act
      const { error } = await harness.call('PATCH', '/tasks/:id/status', {
        params: { id: '1' },
        body: { status: 'done' },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(error?.message).toBe('Position is required');
      expect(harness.queries).toHaveLength(0);
    });

    it('returns 404 when the task to move does not exist', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([{ rows: [] }]));

      // Act
      const { error } = await harness.call('PATCH', '/tasks/:id/status', {
        params: { id: '404' },
        body: { status: 'done', position: 1 },
      });

      // Assert
      expect(error?.status).toBe(404);
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('unassigns by writing null when assigned_user_id is omitted', async () => {
      // Arrange
      const harness = loadRouter(
        'tasks.js',
        queryQueue([{ rows: [{ id: 5 }] }, { rows: [{ id: 5, assigned_user_id: null }] }])
      );

      // Act
      const { error } = await harness.call('PATCH', '/tasks/:id/assign', {
        params: { id: '5' },
        body: {},
      });

      // Assert
      expect(error).toBeUndefined();
      expect(harness.queries[0].params).toEqual([null, '5']);
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([{ rows: [] }]));

      // Act
      const { error } = await harness.call('PATCH', '/tasks/:id/assign', {
        params: { id: '5' },
        body: { assigned_user_id: 2 },
      });

      // Assert
      expect(error?.status).toBe(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns the deleted id on success', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([{ rows: [{ id: 8 }] }]));

      // Act
      const { res, error } = await harness.call('DELETE', '/tasks/:id', { params: { id: '8' } });

      // Assert
      expect(error).toBeUndefined();
      expect(res.body).toEqual({ message: 'Task deleted', id: 8 });
    });

    it('returns 404 when nothing was deleted', async () => {
      // Arrange
      const harness = loadRouter('tasks.js', queryQueue([{ rows: [] }]));

      // Act
      const { error } = await harness.call('DELETE', '/tasks/:id', { params: { id: '8' } });

      // Assert
      expect(error?.status).toBe(404);
    });
  });

  describe('error propagation', () => {
    it('forwards database failures to the error middleware', async () => {
      // Arrange
      const failure = new Error('connection lost');
      const harness = loadRouter('tasks.js', async () => {
        throw failure;
      });

      // Act
      const { error } = await harness.call('GET', '/projects/:projectId/tasks', {
        params: { projectId: '1' },
      });

      // Assert
      expect(error).toBe(failure);
    });
  });
});
