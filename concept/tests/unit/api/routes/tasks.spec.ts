import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  getRouteHandler,
  loadRouterWithMockPool,
} from './testHelpers';

const TASKS_ROUTE_PATH = '../../../../apps/api/src/routes/tasks.js';

describe('tasks routes', () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery };

  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('rejects requests with a missing or blank title', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'post', '/projects/:projectId/tasks');
      const req = createMockRequest({ params: { projectId: 'project-1' }, body: { title: '   ' } });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Task title is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates a task at the next available position when title is provided', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'post', '/projects/:projectId/tasks');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', title: 'New Task', position: 2 }] });
      const req = createMockRequest({
        params: { projectId: 'project-1' },
        body: { title: 'New Task' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 'task-1', title: 'New Task', position: 2 });
      expect(mockQuery.mock.calls[1][1]).toEqual(['project-1', 'New Task', null, 2, null]);
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects an invalid status value (boundary condition)', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req = createMockRequest({
        params: { id: 'task-1' },
        body: { status: 'not_a_real_status', position: 0 },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a missing position (boundary condition)', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req = createMockRequest({
        params: { id: 'task-1' },
        body: { status: 'in_progress' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Position is required');
    });

    it('accepts position 0 as valid (falsy-but-present boundary case)', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', status: 'in_progress', position: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', status: 'in_progress', position: 0 }] });
      const req = createMockRequest({
        params: { id: 'task-1' },
        body: { status: 'in_progress', position: 0 },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = createMockRequest({
        params: { id: 'missing-task' },
        body: { status: 'done', position: 1 },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(404);
      expect(next.mock.calls[0][0].message).toBe('Task not found');
    });
  });

  describe('PUT /tasks/:id', () => {
    it('rejects requests with a missing title', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'put', '/tasks/:id');
      const req = createMockRequest({ params: { id: 'task-1' }, body: {} });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'put', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = createMockRequest({
        params: { id: 'missing-task' },
        body: { title: 'Updated title' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'delete', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = createMockRequest({ params: { id: 'missing-task' } });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('deletes the task and returns a confirmation message', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'delete', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });
      const req = createMockRequest({ params: { id: 'task-1' } });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ message: 'Task deleted', id: 'task-1' });
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('unassigns a task when assigned_user_id is null', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/assign');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', assigned_user_id: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', assigned_user_id: null }] });
      const req = createMockRequest({
        params: { id: 'task-1' },
        body: { assigned_user_id: null },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(mockQuery.mock.calls[0][1]).toEqual([null, 'task-1']);
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const router = loadRouterWithMockPool(TASKS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/assign');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = createMockRequest({
        params: { id: 'missing-task' },
        body: { assigned_user_id: 'user-1' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });
  });
});
