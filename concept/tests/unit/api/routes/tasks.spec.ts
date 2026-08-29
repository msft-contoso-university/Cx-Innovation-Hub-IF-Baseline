import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandler, loadRouteModule } from './routeTestHelpers';

const mockQuery = vi.fn();

describe('routes/tasks', () => {
  let router: { stack: unknown[] };

  beforeEach(() => {
    mockQuery.mockReset();
    router = loadRouteModule('../../../../apps/api/src/routes/tasks.js', mockQuery);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a missing title', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/projects/:projectId/tasks');
      const req = createMockReq({ params: { projectId: '1' }, body: { title: '   ' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: 'Task title is required' }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates a task at the next available position in the todo column', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 3 }] }) // position lookup
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // insert
        .mockResolvedValueOnce({ rows: [{ id: 10, title: 'New task', status: 'todo', position: 3 }] }); // fetch
      const handler = getRouteHandler(router, 'post', '/projects/:projectId/tasks');
      const req = createMockReq({ params: { projectId: '1' }, body: { title: 'New task' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO tasks'),
        ['1', 'New task', null, 3, null]
      );
    });
  });

  describe('PUT /tasks/:id', () => {
    it('rejects a missing title', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'put', '/tasks/:id');
      const req = createMockReq({ params: { id: '1' }, body: {} });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: 'Task title is required' }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getRouteHandler(router, 'put', '/tasks/:id');
      const req = createMockReq({ params: { id: '999' }, body: { title: 'Updated' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: 'Task not found' }));
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects an invalid status value', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req = createMockReq({ params: { id: '1' }, body: { status: 'archived', position: 0 } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a missing position', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req = createMockReq({ params: { id: '1' }, body: { status: 'todo' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: 'Position is required' }));
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('unassigns a task when assigned_user_id is null', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, assigned_user_id: null }] }) // update
        .mockResolvedValueOnce({ rows: [{ id: 1, assigned_user_id: null }] }); // fetch
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/assign');
      const req = createMockReq({ params: { id: '1' }, body: { assigned_user_id: null } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('UPDATE tasks'), [null, '1']);
      expect(res.body).toEqual({ id: 1, assigned_user_id: null });
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/assign');
      const req = createMockReq({ params: { id: '999' }, body: { assigned_user_id: 'user-1' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: 'Task not found' }));
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getRouteHandler(router, 'delete', '/tasks/:id');
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: 'Task not found' }));
    });
  });
});
