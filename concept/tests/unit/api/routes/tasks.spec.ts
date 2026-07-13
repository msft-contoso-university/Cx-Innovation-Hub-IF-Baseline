/**
 * Unit tests for tasks route handlers.
 *
 * Focuses on the validation logic that is unique to this module:
 *   - VALID_STATUSES enforcement on PATCH /tasks/:id/status
 *   - position requirement on PATCH /tasks/:id/status
 *   - title requirement on POST and PUT
 *   - 404 handling for unknown tasks
 *
 * The database module is intercepted via Module._load so tests are isolated.
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databasePath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');
const expressModule = require('express');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

type MockQuery = ReturnType<typeof vi.fn>;

function loadTasksRouter(queryImpl: MockQuery) {
  delete require.cache[tasksRoutePath];
  delete require.cache[databasePath];
  delete require.cache[errorHandlerPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return expressModule;
    if (request === '../services/database' || request === databasePath) {
      return { getPool: () => ({ query: queryImpl }) };
    }
    if (request === '../middleware/errorHandler' || request === errorHandlerPath) {
      return originalLoad(errorHandlerPath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksRoutePath);
}

type RouteLayer = {
  route?: { methods: Record<string, boolean>; path: string; stack: Array<{ handle: Function }> };
};

function findHandler(router: { stack: RouteLayer[] }, method: string, path: string) {
  return router.stack.find(
    (l) => l.route?.methods?.[method] && l.route?.path === path,
  )?.route?.stack?.[0]?.handle;
}

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/status — status validation
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/status — status validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done'];

  it.each(VALID_STATUSES)('accepts valid status "%s"', async (status) => {
    // Arrange
    const task = { id: 't1', status, position: 0 };
    const query = vi.fn().mockResolvedValue({ rows: [task] });
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req = { params: { id: 't1' }, body: { status, position: 0 }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects an invalid status value', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req = { params: { id: 't1' }, body: { status: 'invalid_status', position: 0 }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/invalid status/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a missing status', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req = { params: { id: 't1' }, body: { position: 1 }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });

  it('rejects when position is missing', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req = { params: { id: 't1' }, body: { status: 'done' }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/position/i);
  });

  it('returns 404 when task does not exist', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req = { params: { id: 'unknown' }, body: { status: 'done', position: 0 }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /tasks/:id — title validation
// ---------------------------------------------------------------------------
describe('PUT /tasks/:id — title validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  it('returns 400 when title is missing', async () => {
    const query = vi.fn();
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'put', '/tasks/:id');

    const req = { params: { id: 't1' }, body: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 when title is blank', async () => {
    const query = vi.fn();
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'put', '/tasks/:id');

    const req = { params: { id: 't1' }, body: { title: '   ' }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });

  it('returns 404 when the task does not exist', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'put', '/tasks/:id');

    const req = { params: { id: 'ghost' }, body: { title: 'Valid title' }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id
// ---------------------------------------------------------------------------
describe('DELETE /tasks/:id', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  it('returns 404 when task is not found', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'delete', '/tasks/:id');

    const req = { params: { id: 'missing' }, body: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(404);
  });

  it('returns a success message when task is deleted', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'del-1' }] });
    const router = loadTasksRouter(query);
    const handler = findHandler(router, 'delete', '/tasks/:id');

    const req = { params: { id: 'del-1' }, body: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'del-1' }));
  });
});
