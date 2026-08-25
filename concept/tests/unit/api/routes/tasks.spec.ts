import { afterEach, describe, expect, it } from 'vitest';

import { loadRoute, type RouteHarness } from './routerHarness';

let harness: RouteHarness | undefined;

function createHarness(): RouteHarness {
  harness = loadRoute('tasks');
  return harness;
}

afterEach(() => {
  harness?.dispose();
  harness = undefined;
});

describe('tasks routes', () => {
  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a missing title with 400 before touching the database', async () => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('post', '/projects/:projectId/tasks', {
        params: { projectId: 'p-1' },
        body: {},
      });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toBe('Task title is required');
      expect(route.queries).toHaveLength(0);
    });

    it('rejects a whitespace-only title with 400', async () => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('post', '/projects/:projectId/tasks', {
        params: { projectId: 'p-1' },
        body: { title: '   ' },
      });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(route.queries).toHaveLength(0);
    });

    it('trims the title, appends to the end of the todo column and returns 201', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ next_pos: 4 }] });
      route.queueQueryResult({ rows: [{ id: 't-9' }] });
      route.queueQueryResult({ rows: [{ id: 't-9', title: 'Ship it', assigned_user_name: null }] });

      // Act
      const result = await route.invoke('post', '/projects/:projectId/tasks', {
        params: { projectId: 'p-1' },
        body: { title: '  Ship it  ', description: undefined, assigned_user_id: undefined },
      });

      // Assert
      expect(result.error).toBeUndefined();
      expect(result.statusCode).toBe(201);
      expect(result.body).toEqual({ id: 't-9', title: 'Ship it', assigned_user_name: null });
      expect(route.queries[1].params).toEqual(['p-1', 'Ship it', null, 4, null]);
    });

    it('forwards database failures to the error handler', async () => {
      // Arrange
      const route = createHarness();
      const dbError = new Error('connection lost');
      route.queueQueryError(dbError);

      // Act
      const result = await route.invoke('post', '/projects/:projectId/tasks', {
        params: { projectId: 'p-1' },
        body: { title: 'Ship it' },
      });

      // Assert
      expect(result.error).toBe(dbError);
      expect(result.body).toBeUndefined();
    });
  });

  describe('PUT /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [] });

      // Act
      const result = await route.invoke('put', '/tasks/:id', {
        params: { id: 'missing' },
        body: { title: 'New title' },
      });

      // Assert
      expect(result.error?.status).toBe(404);
      expect(result.error?.message).toBe('Task not found');
    });

    it('updates the task and returns the hydrated row', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ id: 't-1' }] });
      route.queueQueryResult({ rows: [{ id: 't-1', title: 'New title', assigned_user_name: 'Ada' }] });

      // Act
      const result = await route.invoke('put', '/tasks/:id', {
        params: { id: 't-1' },
        body: { title: '  New title  ', description: '' },
      });

      // Assert
      expect(result.error).toBeUndefined();
      expect(route.queries[0].params).toEqual(['New title', null, 't-1']);
      expect(result.body).toEqual({ id: 't-1', title: 'New title', assigned_user_name: 'Ada' });
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it.each(['', 'archived', 'DONE'])('rejects invalid status %j with 400', async (status) => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('patch', '/tasks/:id/status', {
        params: { id: 't-1' },
        body: { status, position: 0 },
      });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain('Invalid status');
      expect(route.queries).toHaveLength(0);
    });

    it('rejects a missing position with 400', async () => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('patch', '/tasks/:id/status', {
        params: { id: 't-1' },
        body: { status: 'done' },
      });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toBe('Position is required');
      expect(route.queries).toHaveLength(0);
    });

    it('accepts position 0 as a valid boundary value', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ id: 't-1' }] });
      route.queueQueryResult({ rows: [{ id: 't-1', status: 'in_review', position: 0 }] });

      // Act
      const result = await route.invoke('patch', '/tasks/:id/status', {
        params: { id: 't-1' },
        body: { status: 'in_review', position: 0 },
      });

      // Assert
      expect(result.error).toBeUndefined();
      expect(route.queries[0].params).toEqual(['in_review', 0, 't-1']);
      expect(result.body).toEqual({ id: 't-1', status: 'in_review', position: 0 });
    });

    it('returns 404 when the task to move does not exist', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [] });

      // Act
      const result = await route.invoke('patch', '/tasks/:id/status', {
        params: { id: 'missing' },
        body: { status: 'todo', position: 1 },
      });

      // Assert
      expect(result.error?.status).toBe(404);
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('unassigns the task when assigned_user_id is omitted', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ id: 't-1' }] });
      route.queueQueryResult({ rows: [{ id: 't-1', assigned_user_id: null }] });

      // Act
      const result = await route.invoke('patch', '/tasks/:id/assign', {
        params: { id: 't-1' },
        body: {},
      });

      // Assert
      expect(result.error).toBeUndefined();
      expect(route.queries[0].params).toEqual([null, 't-1']);
      expect(result.body).toEqual({ id: 't-1', assigned_user_id: null });
    });

    it('assigns the given user', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ id: 't-1' }] });
      route.queueQueryResult({ rows: [{ id: 't-1', assigned_user_id: 'u-7' }] });

      // Act
      const result = await route.invoke('patch', '/tasks/:id/assign', {
        params: { id: 't-1' },
        body: { assigned_user_id: 'u-7' },
      });

      // Assert
      expect(route.queries[0].params).toEqual(['u-7', 't-1']);
      expect(result.body).toEqual({ id: 't-1', assigned_user_id: 'u-7' });
    });

    it('returns 404 when assigning to an unknown task', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [] });

      // Act
      const result = await route.invoke('patch', '/tasks/:id/assign', {
        params: { id: 'missing' },
        body: { assigned_user_id: 'u-7' },
      });

      // Assert
      expect(result.error?.status).toBe(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns 404 when nothing was deleted', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [] });

      // Act
      const result = await route.invoke('delete', '/tasks/:id', { params: { id: 'missing' } });

      // Assert
      expect(result.error?.status).toBe(404);
      expect(result.error?.message).toBe('Task not found');
    });

    it('confirms deletion with the deleted id', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ id: 't-1' }] });

      // Act
      const result = await route.invoke('delete', '/tasks/:id', { params: { id: 't-1' } });

      // Assert
      expect(result.error).toBeUndefined();
      expect(result.body).toEqual({ message: 'Task deleted', id: 't-1' });
    });
  });
});
