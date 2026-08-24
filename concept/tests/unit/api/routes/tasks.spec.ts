/**
 * Unit tests for concept/apps/api/src/routes/tasks.js
 *
 * Focus: input validation, status/position boundary handling and 404 paths for
 * the write endpoints that the new Locust task lifecycle scenario drives.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { loadRouter, nextError, type LoadedRouter } from '../helpers/routeHarness';

describe('tasks routes', () => {
  let router: LoadedRouter;

  beforeEach(() => {
    router = loadRouter('tasks');
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a whitespace-only title', async () => {
      // Arrange & Act
      const { next } = await router.invoke('post', '/projects/:projectId/tasks', {
        params: { projectId: 'p1' },
        body: { title: '   ' },
      });

      // Assert
      expect(nextError(next).status).toBe(400);
      expect(nextError(next).message).toBe('Task title is required');
      expect(router.query).not.toHaveBeenCalled();
    });

    it('places a new task at the next free position in the todo column', async () => {
      // Arrange
      router.query
        .mockResolvedValueOnce({ rows: [{ next_pos: 4 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', position: 4 }] });

      // Act
      const { res, next } = await router.invoke('post', '/projects/:projectId/tasks', {
        params: { projectId: 'p1' },
        body: { title: '  Write tests  ' },
      });

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(router.query.mock.calls[1][1]).toEqual(['p1', 'Write tests', null, 4, null]);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 'task-1', position: 4 });
    });
  });

  describe('PUT /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      router.query.mockResolvedValueOnce({ rows: [] });

      // Act
      const { next } = await router.invoke('put', '/tasks/:id', {
        params: { id: 'missing' },
        body: { title: 'New title' },
      });

      // Assert
      expect(nextError(next).status).toBe(404);
      expect(nextError(next).message).toBe('Task not found');
    });

    it('normalizes a missing description to null', async () => {
      // Arrange
      router.query
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', title: 'New title' }] });

      // Act
      const { res, next } = await router.invoke('put', '/tasks/:id', {
        params: { id: 'task-1' },
        body: { title: 'New title' },
      });

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(router.query.mock.calls[0][1]).toEqual(['New title', null, 'task-1']);
      expect(res.body).toEqual({ id: 'task-1', title: 'New title' });
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects a status outside the allowed set', async () => {
      // Arrange & Act
      const { next } = await router.invoke('patch', '/tasks/:id/status', {
        params: { id: 'task-1' },
        body: { status: 'archived', position: 0 },
      });

      // Assert
      expect(nextError(next).status).toBe(400);
      expect(nextError(next).message).toBe(
        'Invalid status. Must be one of: todo, in_progress, in_review, done',
      );
      expect(router.query).not.toHaveBeenCalled();
    });

    it('rejects a missing position', async () => {
      // Arrange & Act
      const { next } = await router.invoke('patch', '/tasks/:id/status', {
        params: { id: 'task-1' },
        body: { status: 'done' },
      });

      // Assert
      expect(nextError(next).status).toBe(400);
      expect(nextError(next).message).toBe('Position is required');
      expect(router.query).not.toHaveBeenCalled();
    });

    it('accepts position 0 as a valid boundary value', async () => {
      // Arrange
      router.query
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', status: 'done', position: 0 }] });

      // Act
      const { res, next } = await router.invoke('patch', '/tasks/:id/status', {
        params: { id: 'task-1' },
        body: { status: 'done', position: 0 },
      });

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(router.query.mock.calls[0][1]).toEqual(['done', 0, 'task-1']);
      expect(res.body).toEqual({ id: 'task-1', status: 'done', position: 0 });
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('unassigns the task when assigned_user_id is null', async () => {
      // Arrange
      router.query
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', assigned_user_id: null }] });

      // Act
      const { res, next } = await router.invoke('patch', '/tasks/:id/assign', {
        params: { id: 'task-1' },
        body: { assigned_user_id: null },
      });

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(router.query.mock.calls[0][1]).toEqual([null, 'task-1']);
      expect(res.body).toEqual({ id: 'task-1', assigned_user_id: null });
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      router.query.mockResolvedValueOnce({ rows: [] });

      // Act
      const { next } = await router.invoke('patch', '/tasks/:id/assign', {
        params: { id: 'missing' },
        body: { assigned_user_id: 'user-1' },
      });

      // Assert
      expect(nextError(next).status).toBe(404);
      expect(nextError(next).message).toBe('Task not found');
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      router.query.mockResolvedValueOnce({ rows: [] });

      // Act
      const { next } = await router.invoke('delete', '/tasks/:id', {
        params: { id: 'missing' },
      });

      // Assert
      expect(nextError(next).status).toBe(404);
      expect(nextError(next).message).toBe('Task not found');
    });

    it('confirms deletion with the deleted task id', async () => {
      // Arrange
      router.query.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });

      // Act
      const { res, next } = await router.invoke('delete', '/tasks/:id', {
        params: { id: 'task-1' },
      });

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ message: 'Task deleted', id: 'task-1' });
    });
  });
});
