import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

/**
 * Loads the tasks router with the database service mocked, and returns a
 * lookup helper to grab a specific route's handler function directly off
 * the Express router stack (no HTTP server / supertest needed).
 */
function loadTasksRouter() {
  delete require.cache[tasksModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }

    return originalLoad(request, parent, isMain);
  };

  const router = require(tasksModulePath);
  return router;
}

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createMockRes() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('tasks routes', () => {
  let router: any;

  beforeEach(() => {
    vi.clearAllMocks();
    router = loadTasksRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a missing title with a 400 error', async () => {
      // Arrange
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req = { params: { projectId: 'p1' }, body: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only title with a 400 error', async () => {
      // Arrange
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req = { params: { projectId: 'p1' }, body: { title: '   ' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('creates a task with a trimmed title at the next todo position', async () => {
      // Arrange
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req = {
        params: { projectId: 'p1' },
        body: { title: '  Write docs  ', description: 'Details' },
      };
      const res = createMockRes();
      const next = vi.fn();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', title: 'Write docs' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO tasks'),
        ['p1', 'Write docs', 'Details', 2, null]
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 't1', title: 'Write docs' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('PUT /tasks/:id', () => {
    it('rejects a missing title with a 400 error', async () => {
      // Arrange
      const handler = getHandler(router, 'put', '/tasks/:id');
      const req = { params: { id: 't1' }, body: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns a 404 error when the task does not exist', async () => {
      // Arrange
      const handler = getHandler(router, 'put', '/tasks/:id');
      const req = { params: { id: 'missing' }, body: { title: 'New title' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects an invalid status with a 400 error', async () => {
      // Arrange
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'archived', position: 0 } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining('Invalid status'),
        })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a missing position with a 400 error', async () => {
      // Arrange
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'todo' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Position is required' })
      );
    });

    it('returns a 404 error when the task does not exist', async () => {
      // Arrange
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 'missing' }, body: { status: 'todo', position: 0 } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('updates status and position for a valid request', async () => {
      // Arrange
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'in_progress', position: 1 } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', status: 'in_progress' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ id: 't1', status: 'in_progress' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('assigns a user to a task', async () => {
      // Arrange
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      const req = { params: { id: 't1' }, body: { assigned_user_id: 'u1' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: 'u1' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE tasks SET assigned_user_id'),
        ['u1', 't1']
      );
      expect(res.json).toHaveBeenCalledWith({ id: 't1', assigned_user_id: 'u1' });
    });

    it('treats a falsy assigned_user_id as unassigning the task', async () => {
      // Arrange
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      const req = { params: { id: 't1' }, body: { assigned_user_id: null } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: null }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE tasks SET assigned_user_id'),
        [null, 't1']
      );
    });

    it('returns a 404 error when the task does not exist', async () => {
      // Arrange
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      const req = { params: { id: 'missing' }, body: { assigned_user_id: 'u1' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns a 404 error when the task does not exist', async () => {
      // Arrange
      const handler = getHandler(router, 'delete', '/tasks/:id');
      const req = { params: { id: 'missing' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });

    it('deletes the task and returns a confirmation message', async () => {
      // Arrange
      const handler = getHandler(router, 'delete', '/tasks/:id');
      const req = { params: { id: 't1' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 't1' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('forwards unexpected errors to next() instead of throwing', async () => {
    // Arrange
    const handler = getHandler(router, 'delete', '/tasks/:id');
    const req = { params: { id: 't1' } };
    const res = createMockRes();
    const next = vi.fn();
    const dbError = new Error('connection lost');
    mockQuery.mockRejectedValueOnce(dbError);

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.json).not.toHaveBeenCalled();
  });
});
