/**
 * Unit tests for the tasks route handlers.
 *
 * Uses the Module._load interception pattern (same as database.spec.ts) to
 * mock the pg Pool so no real database is needed.  Route handlers are
 * extracted from the Express Router stack and exercised with minimal
 * mock req/res/next objects.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock request. */
function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  };
}

/** Build a minimal mock response with chainable status(). */
function mockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

/**
 * Find an async handler for a given HTTP method + path in an Express Router's
 * internal stack.  Handles both exact paths ("/tasks/:id") and paths that are
 * registered with a mount prefix removed.
 */
function findHandler(router: any, method: string, path: string): Function {
  for (const layer of router.stack) {
    const route = layer.route;
    if (route && route.methods[method.toLowerCase()] && route.path === path) {
      return route.stack[route.stack.length - 1].handle;
    }
  }
  throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
}

// ---------------------------------------------------------------------------
// Module loading with mocked DB
// ---------------------------------------------------------------------------

let mockQueryFn = vi.fn();

async function loadTasksRouter() {
  delete require.cache[tasksModulePath];
  delete require.cache[databaseModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../../../../apps/api/src/services/database.js' ||
        request === '../services/database') {
      return { getPool: () => ({ query: mockQueryFn }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksModulePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tasks route — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -----------------------------------------------------------------------
  // POST /projects/:projectId/tasks
  // -----------------------------------------------------------------------
  describe('POST /projects/:projectId/tasks', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'post', '/projects/:projectId/tasks');
      const req = mockReq({ params: { projectId: '1' }, body: {} });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Task title is required' });
      expect(mockQueryFn).not.toHaveBeenCalled();
    });

    it('calls next with 400 when title is whitespace only', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'post', '/projects/:projectId/tasks');
      const req = mockReq({ params: { projectId: '1' }, body: { title: '   ' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
    });

    it('inserts a task and returns 201 when title is valid', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'post', '/projects/:projectId/tasks');

      const newTask = { id: 99, title: 'New task', status: 'todo', position: 0 };
      mockQueryFn
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })   // position query
        .mockResolvedValueOnce({ rows: [{ id: 99 }] })         // INSERT RETURNING
        .mockResolvedValueOnce({ rows: [newTask] });            // SELECT with user JOIN

      const req = mockReq({ params: { projectId: '1' }, body: { title: 'New task' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newTask);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /tasks/:id
  // -----------------------------------------------------------------------
  describe('PUT /tasks/:id', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'put', '/tasks/:id');
      const req = mockReq({ params: { id: '1' }, body: {} });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Task title is required' });
    });

    it('calls next with 400 when title is blank', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'put', '/tasks/:id');
      const req = mockReq({ params: { id: '1' }, body: { title: '' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
    });

    it('calls next with 404 when the task does not exist', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'put', '/tasks/:id');
      mockQueryFn.mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows

      const req = mockReq({ params: { id: '999' }, body: { title: 'Updated' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /tasks/:id/status
  // -----------------------------------------------------------------------
  describe('PATCH /tasks/:id/status', () => {
    it('calls next with 400 for an invalid status value', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'patch', '/tasks/:id/status');
      const req = mockReq({ params: { id: '1' }, body: { status: 'invalid_status', position: 0 } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toContain('Invalid status');
    });

    it('calls next with 400 when status is missing', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'patch', '/tasks/:id/status');
      const req = mockReq({ params: { id: '1' }, body: { position: 0 } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
    });

    it('calls next with 400 when position is missing', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'patch', '/tasks/:id/status');
      const req = mockReq({ params: { id: '1' }, body: { status: 'todo' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Position is required' });
    });

    it('accepts all four valid status values', async () => {
      const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];

      for (const status of validStatuses) {
        // Arrange
        const router = await loadTasksRouter();
        const handler = findHandler(router, 'patch', '/tasks/:id/status');
        const updatedTask = { id: 1, status, position: 0 };
        mockQueryFn
          .mockResolvedValueOnce({ rows: [{ id: 1, status, position: 0 }] }) // UPDATE
          .mockResolvedValueOnce({ rows: [updatedTask] });                   // SELECT with JOIN

        const req = mockReq({ params: { id: '1' }, body: { status, position: 0 } });
        const res = mockRes();
        const next = vi.fn();

        // Act
        await handler(req, res, next);

        // Assert
        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(updatedTask);
      }
    });

    it('calls next with 404 when the task is not found', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'patch', '/tasks/:id/status');
      mockQueryFn.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ params: { id: '999' }, body: { status: 'done', position: 1 } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /tasks/:id/assign
  // -----------------------------------------------------------------------
  describe('PATCH /tasks/:id/assign', () => {
    it('calls next with 404 when the task is not found', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'patch', '/tasks/:id/assign');
      mockQueryFn.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ params: { id: '999' }, body: { assigned_user_id: 'user-1' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
    });

    it('clears the assigned user when assigned_user_id is null', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'patch', '/tasks/:id/assign');
      const updatedTask = { id: 1, assigned_user_id: null };
      mockQueryFn
        .mockResolvedValueOnce({ rows: [{ id: 1, assigned_user_id: null }] }) // UPDATE
        .mockResolvedValueOnce({ rows: [updatedTask] });                       // SELECT with JOIN

      const req = mockReq({ params: { id: '1' }, body: { assigned_user_id: null } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(updatedTask);
      // Confirm null is passed to the query (not undefined)
      expect(mockQueryFn.mock.calls[0][1][0]).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /tasks/:id
  // -----------------------------------------------------------------------
  describe('DELETE /tasks/:id', () => {
    it('calls next with 404 when the task does not exist', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'delete', '/tasks/:id');
      mockQueryFn.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
    });

    it('returns the deleted task id on success', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'delete', '/tasks/:id');
      mockQueryFn.mockResolvedValueOnce({ rows: [{ id: 42 }] });

      const req = mockReq({ params: { id: '42' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 42 });
    });
  });
});
