import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResponse,
  getHandler,
  loadRouteModule,
  type LoadedRouter,
} from '../../helpers/expressRouterHarness';

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  } as any;
}

describe('tasks routes', () => {
  let query: ReturnType<typeof vi.fn>;
  let router: LoadedRouter;

  beforeEach(() => {
    query = vi.fn();
    router = loadRouteModule('tasks.js', query);
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('creates a task with a trimmed title at the next todo position', async () => {
      // Arrange
      query
        .mockResolvedValueOnce({ rows: [{ next_pos: 3 }] })
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })
        .mockResolvedValueOnce({ rows: [{ id: 42, title: 'Write tests' }] });
      const req = createRequest({
        params: { projectId: '7' },
        body: { title: '  Write tests  ' },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'POST /projects/:projectId/tasks')(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 42, title: 'Write tests' });
      expect(query.mock.calls[1][1]).toEqual(['7', 'Write tests', null, 3, null]);
    });

    it('rejects a whitespace-only title without touching the database', async () => {
      // Arrange
      const req = createRequest({ params: { projectId: '7' }, body: { title: '   ' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'POST /projects/:projectId/tasks')(req, res, next);

      // Assert
      expect(query).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 400,
        message: 'Task title is required',
      });
    });
  });

  describe('PUT /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [] });
      const req = createRequest({ params: { id: '99' }, body: { title: 'Renamed' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PUT /tasks/:id')(req, res, next);

      // Assert
      expect(query).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
    });

    it('forwards database failures to the error handler', async () => {
      // Arrange
      const dbError = new Error('connection lost');
      query.mockRejectedValueOnce(dbError);
      const req = createRequest({ params: { id: '1' }, body: { title: 'Renamed' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PUT /tasks/:id')(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
      expect(res.body).toBeUndefined();
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects a status outside the allowed set', async () => {
      // Arrange
      const req = createRequest({
        params: { id: '1' },
        body: { status: 'archived', position: 0 },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PATCH /tasks/:id/status')(req, res, next);

      // Assert
      expect(query).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 400,
        message: 'Invalid status. Must be one of: todo, in_progress, in_review, done',
      });
    });

    it('accepts position 0 as a valid boundary value', async () => {
      // Arrange
      query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'done', position: 0 }] });
      const req = createRequest({
        params: { id: '1' },
        body: { status: 'done', position: 0 },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PATCH /tasks/:id/status')(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(query.mock.calls[0][1]).toEqual(['done', 0, '1']);
      expect(res.body).toEqual({ id: 1, status: 'done', position: 0 });
    });

    it('rejects a missing position', async () => {
      // Arrange
      const req = createRequest({ params: { id: '1' }, body: { status: 'done' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PATCH /tasks/:id/status')(req, res, next);

      // Assert
      expect(query).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 400,
        message: 'Position is required',
      });
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('unassigns the task when assigned_user_id is null', async () => {
      // Arrange
      query
        .mockResolvedValueOnce({ rows: [{ id: 5 }] })
        .mockResolvedValueOnce({ rows: [{ id: 5, assigned_user_id: null }] });
      const req = createRequest({ params: { id: '5' }, body: { assigned_user_id: null } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PATCH /tasks/:id/assign')(req, res, next);

      // Assert
      expect(query.mock.calls[0][1]).toEqual([null, '5']);
      expect(res.body).toEqual({ id: 5, assigned_user_id: null });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 404 when assigning a task that does not exist', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [] });
      const req = createRequest({ params: { id: '404' }, body: { assigned_user_id: 2 } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PATCH /tasks/:id/assign')(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns the deleted id on success', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [{ id: 8 }] });
      const req = createRequest({ params: { id: '8' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'DELETE /tasks/:id')(req, res, next);

      // Assert
      expect(res.body).toEqual({ message: 'Task deleted', id: 8 });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 404 when deleting a task that does not exist', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [] });
      const req = createRequest({ params: { id: '404' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'DELETE /tasks/:id')(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
    });
  });
});
