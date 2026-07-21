/**
 * Unit tests for the tasks route handlers.
 *
 * Focuses on input validation logic that runs before any database call:
 *   - Title required (POST, PUT)
 *   - Valid status values (PATCH /status)
 *   - Position required (PATCH /status)
 *   - Task-not-found handling (PUT, PATCH, DELETE when DB returns no rows)
 *
 * DB interactions are mocked via Module._load interception.
 */

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const expressModule = require('express');

const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMockPool(queryImpl: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { query: vi.fn().mockImplementation(queryImpl) };
}

function findHandler(router: any, method: string, routePath: string) {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.methods[method.toLowerCase()] === true &&
      l.route.path === routePath,
  );
  if (!layer) throw new Error(`Handler not found: ${method.toUpperCase()} ${routePath}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

async function loadTasksRouter(mockPool: ReturnType<typeof makeMockPool>) {
  delete require.cache[tasksRoutePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return expressModule;
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  return require(tasksRoutePath);
}

// ---------------------------------------------------------------------------
// Tests – POST /projects/:projectId/tasks
// ---------------------------------------------------------------------------
describe('tasks route – POST /projects/:projectId/tasks', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when title is missing', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks');

    const req: any = { params: { projectId: '1' }, body: {} };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Task title is required' }),
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 400 when title is whitespace only', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks');

    const req: any = { params: { projectId: '1' }, body: { title: '   ' } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Task title is required' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests – PUT /tasks/:id
// ---------------------------------------------------------------------------
describe('tasks route – PUT /tasks/:id', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when title is missing', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'put', '/tasks/:id');

    const req: any = { params: { id: '1' }, body: { description: 'desc' } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Task title is required' }),
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not exist', async () => {
    // Arrange – DB UPDATE returns no rows
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'put', '/tasks/:id');

    const req: any = { params: { id: '999' }, body: { title: 'New title' } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Task not found' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests – PATCH /tasks/:id/status
// ---------------------------------------------------------------------------
describe('tasks route – PATCH /tasks/:id/status', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when status is not provided', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req: any = { params: { id: '1' }, body: { position: 0 } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 400 when status is an invalid value', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req: any = { params: { id: '1' }, body: { status: 'wip', position: 0 } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        message: expect.stringContaining('Invalid status'),
      }),
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('accepts all four valid status values without a validation error', async () => {
    const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];

    for (const status of validStatuses) {
      // Arrange – DB UPDATE returns a matching row so the handler proceeds
      let callCount = 0;
      const mockPool = makeMockPool(async () => {
        callCount++;
        // First call: UPDATE – return the updated task row
        if (callCount === 1) return { rows: [{ id: '1', status }] };
        // Second call: re-fetch with user join
        return { rows: [{ id: '1', status, assigned_user_name: null }] };
      });
      const router = await loadTasksRouter(mockPool);
      const handler = findHandler(router, 'patch', '/tasks/:id/status');

      const json = vi.fn();
      const res: any = { json };
      const req: any = { params: { id: '1' }, body: { status, position: 0 } };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    }
  });

  it('returns 400 when position is undefined', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req: any = { params: { id: '1' }, body: { status: 'done' } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Position is required' }),
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 400 when position is null', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req: any = { params: { id: '1' }, body: { status: 'done', position: null } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Position is required' }),
    );
  });

  it('returns 404 when the task does not exist', async () => {
    // Arrange – DB UPDATE returns no rows
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'patch', '/tasks/:id/status');

    const req: any = { params: { id: '999' }, body: { status: 'done', position: 0 } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Task not found' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests – DELETE /tasks/:id
// ---------------------------------------------------------------------------
describe('tasks route – DELETE /tasks/:id', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('returns 404 when the task does not exist', async () => {
    // Arrange – DB DELETE returns no rows
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadTasksRouter(mockPool);
    const handler = findHandler(router, 'delete', '/tasks/:id');

    const req: any = { params: { id: '999' } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Task not found' }),
    );
  });
});
