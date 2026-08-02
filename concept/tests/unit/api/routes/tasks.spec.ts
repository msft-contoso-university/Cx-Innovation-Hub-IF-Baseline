/**
 * Unit tests for concept/apps/api/src/routes/tasks.js
 *
 * Key behaviors under test:
 *  - PATCH /tasks/:id/status  — rejects invalid status values
 *  - PATCH /tasks/:id/status  — rejects missing position
 *  - PUT /tasks/:id           — rejects missing/blank title
 *  - POST /projects/:id/tasks — rejects missing/blank title
 */

import { createRequire } from 'node:module';
import { describe, it, expect, vi, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Minimal Express Router mock
// ---------------------------------------------------------------------------

function createMockRouter() {
  const router: any = { stack: [] };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = function (path: string, handler: Function) {
      this.stack.push({
        route: {
          path,
          methods: { [method]: true },
          stack: [{ handle: handler }],
        },
      });
    };
  }
  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function findHandler(router: any, method: string, routePath: string): Function | undefined {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.path === routePath &&
      l.route.methods[method.toLowerCase()],
  );
  if (!layer) return undefined;
  const routeLayers = layer.route.stack;
  return routeLayers[routeLayers.length - 1].handle;
}

function loadRouterWithMockPool(queryResponses: Array<{ rows: any[] }>) {
  delete require.cache[tasksModulePath];

  let callIndex = 0;
  const mockQuery = vi.fn(async () => {
    const response = queryResponses[callIndex] ?? { rows: [] };
    callIndex++;
    return response;
  });
  const mockPool = { query: mockQuery };

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: createMockRouter };
    }
    if (request === '../services/database' || request.endsWith('services/database.js')) {
      return { getPool: () => mockPool };
    }
    if (
      request === '../middleware/errorHandler' ||
      request.endsWith('middleware/errorHandler.js')
    ) {
      return originalLoad(errorHandlerModulePath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  const router = require(tasksModulePath);
  return { router, mockQuery };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /tasks/:id/status — validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 for an unrecognised status value', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
    const req: any = {
      params: { id: 't-1' },
      body: { status: 'wontfix', position: 0 },
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/Invalid status/i);
  });

  it('returns 400 when position is missing', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
    const req: any = {
      params: { id: 't-1' },
      body: { status: 'done' },
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/position/i);
  });

  it('returns 400 when status is absent', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
    const req: any = { params: { id: 't-1' }, body: { position: 0 }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('accepts all valid status values', async () => {
    const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];
    for (const status of validStatuses) {
      // Arrange
      const taskRow = { id: 't-1', status, position: 0 };
      const taskWithUser = { ...taskRow, assigned_user_name: null };
      const { router } = loadRouterWithMockPool([
        { rows: [taskRow] },
        { rows: [taskWithUser] },
      ]);
      const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
      const req: any = {
        params: { id: 't-1' },
        body: { status, position: 0 },
        headers: {},
      };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(taskWithUser);
    }
  });

  it('returns 404 when task does not exist', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([{ rows: [] }]);
    const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
    const req: any = {
      params: { id: 't-999' },
      body: { status: 'done', position: 0 },
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });
});

describe('PUT /tasks/:id — validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when title is missing', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'put', '/tasks/:id')!;
    const req: any = { params: { id: 't-1' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title/i);
  });

  it('returns 400 when title is blank whitespace', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'put', '/tasks/:id')!;
    const req: any = { params: { id: 't-1' }, body: { title: '   ' }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('returns 404 when task does not exist', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([{ rows: [] }]); // UPDATE returns no rows
    const handler = findHandler(router, 'put', '/tasks/:id')!;
    const req: any = {
      params: { id: 't-999' },
      body: { title: 'Updated Title' },
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('updates and returns the task', async () => {
    // Arrange
    const updatedRow = { id: 't-1', title: 'New Title', description: null };
    const taskWithUser = { ...updatedRow, assigned_user_name: 'Bob', assigned_user_avatar_color: '#00f' };
    const { router } = loadRouterWithMockPool([
      { rows: [updatedRow] },
      { rows: [taskWithUser] },
    ]);
    const handler = findHandler(router, 'put', '/tasks/:id')!;
    const req: any = {
      params: { id: 't-1' },
      body: { title: 'New Title', description: null },
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(taskWithUser);
  });
});

describe('POST /projects/:projectId/tasks — validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when title is missing', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks')!;
    const req: any = {
      params: { projectId: 'proj-1' },
      body: {},
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title/i);
  });

  it('returns 400 when title is blank whitespace', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks')!;
    const req: any = {
      params: { projectId: 'proj-1' },
      body: { title: '  ' },
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('creates a task and returns 201 with user details', async () => {
    // Arrange
    const newTask = { id: 't-99', project_id: 'proj-1', title: 'New Task', status: 'todo', position: 0 };
    const taskWithUser = { ...newTask, assigned_user_name: null, assigned_user_avatar_color: null };
    const { router } = loadRouterWithMockPool([
      { rows: [{ next_pos: 0 }] },         // position query
      { rows: [newTask] },                  // INSERT
      { rows: [taskWithUser] },             // re-fetch with user join
    ]);
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks')!;
    const req: any = {
      params: { projectId: 'proj-1' },
      body: { title: 'New Task' },
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(taskWithUser);
  });
});

describe('DELETE /tasks/:id', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 404 when task does not exist', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([{ rows: [] }]);
    const handler = findHandler(router, 'delete', '/tasks/:id')!;
    const req: any = { params: { id: 't-999' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('deletes a task and returns confirmation', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([{ rows: [{ id: 't-1' }] }]);
    const handler = findHandler(router, 'delete', '/tasks/:id')!;
    const req: any = { params: { id: 't-1' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 't-1' });
  });
});
