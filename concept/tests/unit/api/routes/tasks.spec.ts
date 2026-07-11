import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// Pre-load express from test's node_modules before patching Module._load
const expressModule = require('express');

const tasksRouterPath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPool(queryImpl?: (sql: string, params?: unknown[]) => unknown) {
  const query = vi.fn((sql: string, params?: unknown[]) =>
    queryImpl ? queryImpl(sql, params) : Promise.resolve({ rows: [] }),
  );
  return { query };
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json, _json: json };
}

/** Finds the last handler on a specific route. */
function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  if (!layer) throw new Error(`No handler found for ${method} ${path}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle as Function;
}

async function loadTasksRouter(mockPool: ReturnType<typeof makeMockPool>) {
  delete require.cache[tasksRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: () => mockPool };
    }
    // Redirect bare 'express' to the copy installed in the test package
    if (request === 'express') {
      return expressModule;
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksRouterPath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tasks routes — input validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[tasksRouterPath];
    delete require.cache[databaseModulePath];
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const mockPool = makeMockPool();
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'post', '/projects/:projectId/tasks');

      const req: any = { params: { projectId: '1' }, body: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/title/i);
    });

    it('calls next with 400 when title is whitespace only', async () => {
      // Arrange
      const mockPool = makeMockPool();
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'post', '/projects/:projectId/tasks');

      const req: any = { params: { projectId: '1' }, body: { title: '   ' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
    });
  });

  describe('PUT /tasks/:id', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const mockPool = makeMockPool();
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'put', '/tasks/:id');

      const req: any = { params: { id: '42' }, body: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/title/i);
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('calls next with 400 when status is missing', async () => {
      // Arrange
      const mockPool = makeMockPool();
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'patch', '/tasks/:id/status');

      const req: any = { params: { id: '42' }, body: { position: 0 }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/status/i);
    });

    it('calls next with 400 when status value is not in VALID_STATUSES', async () => {
      // Arrange
      const mockPool = makeMockPool();
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'patch', '/tasks/:id/status');

      const req: any = { params: { id: '42' }, body: { status: 'unknown', position: 0 }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/invalid status/i);
    });

    it('calls next with 400 when position is missing', async () => {
      // Arrange
      const mockPool = makeMockPool();
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'patch', '/tasks/:id/status');

      const req: any = { params: { id: '42' }, body: { status: 'todo' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/position/i);
    });

    it('accepts position value of 0 as valid', async () => {
      // Arrange — pool returns a task row so the handler completes normally
      const taskRow = { id: '42', status: 'todo', position: 0 };
      const mockPool = makeMockPool(async (sql: string) => {
        if (/UPDATE tasks/.test(sql)) return { rows: [taskRow] };
        return { rows: [{ ...taskRow, assigned_user_name: null }] };
      });
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'patch', '/tasks/:id/status');

      const req: any = { params: { id: '42' }, body: { status: 'todo', position: 0 }, headers: {} };
      const res = { json: vi.fn(), status: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert — next must NOT have been called with an error
      if (next.mock.calls.length > 0) {
        expect(next.mock.calls[0][0]).toBeUndefined();
      }
    });

    it('calls next with 404 when task is not found', async () => {
      // Arrange
      const mockPool = makeMockPool(async (sql: string) => {
        if (/UPDATE tasks/.test(sql)) return { rows: [] };
        return { rows: [] };
      });
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'patch', '/tasks/:id/status');

      const req: any = { params: { id: '999' }, body: { status: 'done', position: 1 }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      const mockPool = makeMockPool(async () => ({ rows: [] }));
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'delete', '/tasks/:id');

      const req: any = { params: { id: '999' }, body: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
    });

    it('returns deleted id on success', async () => {
      // Arrange
      const mockPool = makeMockPool(async () => ({ rows: [{ id: '5' }] }));
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'delete', '/tasks/:id');

      const req: any = { params: { id: '5' }, body: {}, headers: {} };
      const jsonSpy = vi.fn();
      const res = { json: jsonSpy, status: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ id: '5' }));
    });
  });
});
