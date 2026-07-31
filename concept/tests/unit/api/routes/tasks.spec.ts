import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Lightweight Express Router mock
// ---------------------------------------------------------------------------

function createMockRouter() {
  const stack: any[] = [];
  const router: any = { stack };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (routePath: string, handler: Function) => {
      stack.push({
        route: {
          path: routePath,
          methods: { [method]: true },
          stack: [{ handle: handler }],
        },
      });
    };
  }
  return router;
}

const expressMock = { Router: createMockRouter };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHandler(router: any, method: string, routePath: string): Function {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.path === routePath &&
      l.route.methods[method.toLowerCase()],
  );
  if (!layer) throw new Error(`No ${method} ${routePath} route found`);
  return layer.route.stack[0].handle;
}

function buildRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json }, status, json };
}

// Real createError — no external deps.
const { createError } = require(errorHandlerModulePath);

async function loadRouter(mockGetPool: () => any) {
  delete require.cache[tasksModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return expressMock;

    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databaseModulePath) {
        return { getPool: mockGetPool };
      }
      if (resolved === errorHandlerModulePath) {
        return { createError };
      }
    } catch {
      // ignore resolution errors
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksModulePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('tasks routes', () => {
  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[tasksModulePath];
  });

  // ── PATCH /api/tasks/:id/status ───────────────────────────────────────────
  describe('PATCH /tasks/:id/status', () => {
    const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done'];

    it.each(VALID_STATUSES)('accepts valid status "%s"', async (validStatus) => {
      // Arrange
      const updated = { id: 1, status: validStatus, position: 0 };
      const taskWithUser = { ...updated, assigned_user_name: null };
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [taskWithUser] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      const req = { params: { id: '1' }, body: { status: validStatus, position: 0 } };
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(taskWithUser);
    });

    it('rejects an invalid status with a 400 error', async () => {
      // Arrange
      const mockQuery = vi.fn();
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      const req = { params: { id: '1' }, body: { status: 'archived', position: 0 } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/invalid status/i);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a missing status with a 400 error', async () => {
      // Arrange
      const router = await loadRouter(() => ({ query: vi.fn() }));
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      const req = { params: { id: '1' }, body: { position: 1 } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('rejects a missing position with a 400 error', async () => {
      // Arrange
      const router = await loadRouter(() => ({ query: vi.fn() }));
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      const req = { params: { id: '1' }, body: { status: 'todo' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/position is required/i);
    });

    it('returns 404 when task does not exist', async () => {
      // Arrange
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      const req = { params: { id: '999' }, body: { status: 'done', position: 0 } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/task not found/i);
    });
  });

  // ── PUT /api/tasks/:id ───────────────────────────────────────────────────
  describe('PUT /tasks/:id', () => {
    it('rejects an empty title with a 400 error', async () => {
      // Arrange
      const router = await loadRouter(() => ({ query: vi.fn() }));
      const handler = getHandler(router, 'put', '/tasks/:id');

      const req = { params: { id: '1' }, body: { title: '   ' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/task title is required/i);
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'put', '/tasks/:id');

      const req = { params: { id: '999' }, body: { title: 'Updated Title' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
    });

    it('trims the title before updating', async () => {
      // Arrange
      const updated = { id: 1, title: 'Trimmed' };
      const taskWithUser = { ...updated, assigned_user_name: null };
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [taskWithUser] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'put', '/tasks/:id');

      const req = { params: { id: '1' }, body: { title: '  Trimmed  ', description: null } };
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks'),
        ['Trimmed', null, '1'],
      );
      expect(json).toHaveBeenCalledWith(taskWithUser);
    });
  });

  // ── POST /api/projects/:projectId/tasks ───────────────────────────────────
  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a missing title with a 400 error', async () => {
      // Arrange
      const router = await loadRouter(() => ({ query: vi.fn() }));
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');

      const req = { params: { projectId: '1' }, body: {} };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/task title is required/i);
    });

    it('creates a task and responds with 201', async () => {
      // Arrange
      const posRow = { next_pos: 0 };
      const inserted = { id: 5, title: 'My Task', project_id: '1' };
      const taskWithUser = { ...inserted, assigned_user_name: null };
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [posRow] })
        .mockResolvedValueOnce({ rows: [inserted] })
        .mockResolvedValueOnce({ rows: [taskWithUser] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');

      const req = { params: { projectId: '1' }, body: { title: '  My Task  ' } };
      const { res, status, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(status).toHaveBeenCalledWith(201);
      expect(json).toHaveBeenCalledWith(taskWithUser);
    });
  });

  // ── DELETE /api/tasks/:id ─────────────────────────────────────────────────
  describe('DELETE /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'delete', '/tasks/:id');

      const req = { params: { id: '999' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/task not found/i);
    });

    it('responds with a confirmation message when task is deleted', async () => {
      // Arrange
      const mockQuery = vi.fn().mockResolvedValue({ rows: [{ id: 7 }] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'delete', '/tasks/:id');

      const req = { params: { id: '7' } };
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(json).toHaveBeenCalledWith({ message: 'Task deleted', id: 7 });
    });
  });

  // ── PATCH /api/tasks/:id/assign ───────────────────────────────────────────
  describe('PATCH /tasks/:id/assign', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');

      const req = { params: { id: '999' }, body: { assigned_user_id: 'user-1' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
    });

    it('assigns a user and returns the updated task', async () => {
      // Arrange
      const updated = { id: 3, assigned_user_id: 'user-1' };
      const taskWithUser = { ...updated, assigned_user_name: 'Alice' };
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [taskWithUser] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');

      const req = { params: { id: '3' }, body: { assigned_user_id: 'user-1' } };
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(json).toHaveBeenCalledWith(taskWithUser);
    });

    it('unassigns a user when assigned_user_id is null', async () => {
      // Arrange
      const updated = { id: 3, assigned_user_id: null };
      const taskWithUser = { ...updated, assigned_user_name: null };
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [taskWithUser] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');

      const req = { params: { id: '3' }, body: { assigned_user_id: null } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks SET assigned_user_id'),
        [null, '3'],
      );
    });
  });
});
