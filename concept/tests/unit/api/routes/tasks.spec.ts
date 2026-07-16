import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  require,
  createMockPool,
  createMockRes,
  getRouteHandler,
  loadRouteModule,
  Module,
  originalLoad,
} from './_helpers.js';

const tasksModulePath = require.resolve(
  '../../../../apps/api/src/routes/tasks.js',
);

describe('tasks routes', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let router: any;
  let teardown: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ mockPool, mockQuery } = createMockPool());
    ({ router, teardown } = await loadRouteModule(tasksModulePath, {
      getPool: () => mockPool,
    }));
  });

  afterEach(() => {
    teardown();
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // PATCH /tasks/:id/status — status validation
  // -------------------------------------------------------------------------

  describe('PATCH /tasks/:id/status', () => {
    it('calls next with 400 when status is missing', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req: any = { body: { position: 0 }, params: { id: '1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when status is an invalid value', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req: any = { body: { status: 'blocked', position: 0 }, params: { id: '1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining('Invalid status'),
        }),
      );
    });

    it('calls next with 400 when position is undefined', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req: any = { body: { status: 'done' }, params: { id: '1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Position is required' }),
      );
    });

    it('calls next with 400 when position is null', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req: any = { body: { status: 'todo', position: null }, params: { id: '1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Position is required' }),
      );
    });

    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');
      const req: any = {
        body: { status: 'in_progress', position: 1 },
        params: { id: 'missing' },
        headers: {},
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' }),
      );
    });

    it('accepts all four valid statuses', async () => {
      const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];
      const handler = getRouteHandler(router, 'patch', '/tasks/:id/status');

      for (const status of validStatuses) {
        vi.clearAllMocks();
        const updatedTask = { id: '1', status };
        // UPDATE returns the task, then SELECT returns the enriched task
        mockQuery
          .mockResolvedValueOnce({ rows: [updatedTask] })
          .mockResolvedValueOnce({ rows: [updatedTask] });

        const req: any = { body: { status, position: 0 }, params: { id: '1' }, headers: {} };
        const res = createMockRes();
        const next = vi.fn();

        await handler(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(updatedTask);
      }
    });
  });

  // -------------------------------------------------------------------------
  // POST /projects/:projectId/tasks
  // -------------------------------------------------------------------------

  describe('POST /projects/:projectId/tasks', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/projects/:projectId/tasks');
      const req: any = { body: {}, params: { projectId: 'p1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' }),
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when title is whitespace only', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/projects/:projectId/tasks');
      const req: any = { body: { title: '   ' }, params: { projectId: 'p1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('creates the task and responds 201 on success', async () => {
      // Arrange
      const task = { id: 't1', title: 'New Task', status: 'todo', position: 0 };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })  // position query
        .mockResolvedValueOnce({ rows: [task] })              // insert
        .mockResolvedValueOnce({ rows: [task] });             // select with user

      const handler = getRouteHandler(router, 'post', '/projects/:projectId/tasks');
      const req: any = { body: { title: 'New Task' }, params: { projectId: 'p1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(task);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PUT /tasks/:id
  // -------------------------------------------------------------------------

  describe('PUT /tasks/:id', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'put', '/tasks/:id');
      const req: any = { body: { description: 'ok' }, params: { id: '1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' }),
      );
    });

    it('calls next with 400 when title is empty string', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'put', '/tasks/:id');
      const req: any = { body: { title: '' }, params: { id: '1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const handler = getRouteHandler(router, 'put', '/tasks/:id');
      const req: any = { body: { title: 'Updated' }, params: { id: 'missing' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' }),
      );
    });

    it('updates the task and returns it on success', async () => {
      // Arrange
      const task = { id: 't1', title: 'Updated Title' };
      mockQuery
        .mockResolvedValueOnce({ rows: [task] })   // update
        .mockResolvedValueOnce({ rows: [task] });  // select with user

      const handler = getRouteHandler(router, 'put', '/tasks/:id');
      const req: any = { body: { title: 'Updated Title' }, params: { id: 't1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(task);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tasks/:id/assign
  // -------------------------------------------------------------------------

  describe('PATCH /tasks/:id/assign', () => {
    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const handler = getRouteHandler(router, 'patch', '/tasks/:id/assign');
      const req: any = { body: { assigned_user_id: 'u1' }, params: { id: 'missing' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' }),
      );
    });

    it('assigns user and returns updated task', async () => {
      // Arrange
      const task = { id: 't1', assigned_user_id: 'u1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [task] });

      const handler = getRouteHandler(router, 'patch', '/tasks/:id/assign');
      const req: any = { body: { assigned_user_id: 'u1' }, params: { id: 't1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(task);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts null assigned_user_id to unassign', async () => {
      // Arrange
      const task = { id: 't1', assigned_user_id: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [task] });

      const handler = getRouteHandler(router, 'patch', '/tasks/:id/assign');
      const req: any = { body: { assigned_user_id: null }, params: { id: 't1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert — query receives null, not undefined
      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /tasks/:id
  // -------------------------------------------------------------------------

  describe('DELETE /tasks/:id', () => {
    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const handler = getRouteHandler(router, 'delete', '/tasks/:id');
      const req: any = { body: {}, params: { id: 'ghost' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' }),
      );
    });

    it('deletes the task and returns confirmation', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });

      const handler = getRouteHandler(router, 'delete', '/tasks/:id');
      const req: any = { body: {}, params: { id: 't1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 't1' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
