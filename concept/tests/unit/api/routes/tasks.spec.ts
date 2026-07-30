import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// Paths to intercept
const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ── helpers ────────────────────────────────────────────────────────────────

type Handler = (req: unknown, res: unknown, next: unknown) => unknown;

type RouteLayer = {
  route: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] };
};

/** Minimal Express Router mock — collects registered routes for test introspection. */
function buildExpressMock() {
  function Router() {
    const stack: RouteLayer[] = [];

    const addRoute = (method: string, path: string, handler: Handler) => {
      stack.push({ route: { path, methods: { [method]: true }, stack: [{ handle: handler }] } });
    };

    return {
      stack,
      get: (path: string, handler: Handler) => addRoute('get', path, handler),
      post: (path: string, handler: Handler) => addRoute('post', path, handler),
      put: (path: string, handler: Handler) => addRoute('put', path, handler),
      patch: (path: string, handler: Handler) => addRoute('patch', path, handler),
      delete: (path: string, handler: Handler) => addRoute('delete', path, handler),
    };
  }

  return { Router };
}

function buildMockQuery(rows: Record<string, unknown>[] = []) {
  return vi.fn().mockResolvedValue({ rows });
}

function buildMockPool(queryMock: ReturnType<typeof vi.fn>) {
  return { query: queryMock };
}

/** Minimal Express-like res builder for testing route handlers. */
function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/** Minimal Express-like req builder. */
function makeReq(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return { params, body, headers };
}

async function loadTasksRouter(queryMock: ReturnType<typeof vi.fn>) {
  delete require.cache[tasksModulePath];
  delete require.cache[databaseModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return buildExpressMock();
    }
    if (request === '../services/database' || request === databaseModulePath) {
      return { getPool: () => buildMockPool(queryMock) };
    }
    if (request === '../middleware/errorHandler' || request === errorHandlerModulePath) {
      return originalLoad(errorHandlerModulePath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksModulePath);
}

// ── helper to extract route handlers from the Express router ───────────────

function getHandler(
  router: { stack: RouteLayer[] },
  method: string,
  path: string,
): Handler {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} handler found for ${path}`);
  return layer.route.stack[0].handle;
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('tasks routes', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  // ── POST /projects/:projectId/tasks ─────────────────────────────────────

  describe('POST /projects/:projectId/tasks', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const queryMock = buildMockQuery([{ next_pos: 0 }]);
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req = makeReq({ projectId: '1' }, {});
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as { status: number; message: string };
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/title/i);
    });

    it('calls next with 400 when title is only whitespace', async () => {
      // Arrange
      const queryMock = buildMockQuery([{ next_pos: 0 }]);
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req = makeReq({ projectId: '1' }, { title: '   ' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('creates a task and returns 201 with title trimmed', async () => {
      // Arrange
      const newTask = { id: 'task-1', title: 'Fix bug', status: 'todo', position: 0 };
      const queryMock = vi
        .fn()
        // First call: get next position
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
        // Second call: insert
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        // Third call: fetch with user join
        .mockResolvedValueOnce({ rows: [newTask] });

      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req = makeReq({ projectId: '1' }, { title: '  Fix bug  ' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newTask);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── PUT /tasks/:id ───────────────────────────────────────────────────────

  describe('PUT /tasks/:id', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const queryMock = buildMockQuery([]);
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'put', '/tasks/:id');
      const req = makeReq({ id: '1' }, { description: 'Something' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'put', '/tasks/:id');
      const req = makeReq({ id: 'nonexistent' }, { title: 'New title' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(404);
    });

    it('updates a task and returns 200', async () => {
      // Arrange
      const updated = { id: 'task-1', title: 'Updated title' };
      const queryMock = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })  // UPDATE
        .mockResolvedValueOnce({ rows: [updated] });           // SELECT with join

      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'put', '/tasks/:id');
      const req = makeReq({ id: 'task-1' }, { title: 'Updated title' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(updated);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── PATCH /tasks/:id/status ──────────────────────────────────────────────

  describe('PATCH /tasks/:id/status', () => {
    const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done'];

    it.each([
      ['missing status', { position: 0 }],
      ['invalid status value', { status: 'unknown_status', position: 0 }],
    ])('calls next with 400 for %s', async (_label, body) => {
      // Arrange
      const queryMock = buildMockQuery([]);
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = makeReq({ id: '1' }, body);
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('calls next with 400 when position is missing', async () => {
      // Arrange
      const queryMock = buildMockQuery([]);
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = makeReq({ id: '1' }, { status: 'done' }); // no position
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = makeReq({ id: 'nonexistent' }, { status: 'done', position: 1 });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(404);
    });

    it.each(VALID_STATUSES)('accepts valid status "%s"', async (status) => {
      // Arrange
      const taskRow = { id: 'task-1', status };
      const queryMock = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        .mockResolvedValueOnce({ rows: [taskRow] });

      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = makeReq({ id: 'task-1' }, { status, position: 0 });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(taskRow);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── PATCH /tasks/:id/assign ──────────────────────────────────────────────

  describe('PATCH /tasks/:id/assign', () => {
    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      const req = makeReq({ id: 'nonexistent' }, { assigned_user_id: 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(404);
    });

    it('assigns a user and returns 200', async () => {
      // Arrange
      const taskRow = { id: 'task-1', assigned_user_id: 'user-1' };
      const queryMock = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        .mockResolvedValueOnce({ rows: [taskRow] });

      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      const req = makeReq({ id: 'task-1' }, { assigned_user_id: 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(taskRow);
    });

    it('unassigns a user when assigned_user_id is null', async () => {
      // Arrange
      const taskRow = { id: 'task-1', assigned_user_id: null };
      const queryMock = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
        .mockResolvedValueOnce({ rows: [taskRow] });

      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      const req = makeReq({ id: 'task-1' }, { assigned_user_id: null });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(taskRow);
    });
  });

  // ── DELETE /tasks/:id ────────────────────────────────────────────────────

  describe('DELETE /tasks/:id', () => {
    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'delete', '/tasks/:id');
      const req = makeReq({ id: 'nonexistent' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(404);
    });

    it('deletes a task and returns 200 with id', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: 'task-42' }] });
      const router = await loadTasksRouter(queryMock);
      const handler = getHandler(router, 'delete', '/tasks/:id');
      const req = makeReq({ id: 'task-42' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 'task-42' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
