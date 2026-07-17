/**
 * Unit tests for the tasks router.
 *
 * Key behaviours verified:
 *  - GET    /projects/:projectId/tasks  — returns tasks array
 *  - POST   /projects/:projectId/tasks  — validates title
 *  - PUT    /tasks/:id                  — validates title, handles 404
 *  - PATCH  /tasks/:id/status           — validates status enum and position
 *  - PATCH  /tasks/:id/assign           — handles 404
 *  - DELETE /tasks/:id                  — handles 404, returns id on success
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let mockQuery: ReturnType<typeof vi.fn>;

function setupMocks() {
  mockQuery = vi.fn();
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database' || request.endsWith('/services/database.js')) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };
}

function buildRouter() {
  const tasksPath = require.resolve('../../../../apps/api/src/routes/tasks.js');
  delete require.cache[tasksPath];
  return require(tasksPath);
}

function buildMockRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 200;
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildMockReq(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
) {
  return { params, body };
}

function findLayer(
  router: ReturnType<typeof buildRouter>,
  method: string,
  path: string,
) {
  return router.stack.find(
    (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
      l.route?.path === path && l.route?.methods?.[method.toLowerCase()],
  );
}

beforeEach(() => {
  setupMocks();
});

afterEach(() => {
  Module._load = originalLoad;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId/tasks
// ---------------------------------------------------------------------------

describe('GET /projects/:projectId/tasks', () => {
  it('returns 200 with task rows from the database', async () => {
    // Arrange
    const router = buildRouter();
    const fakeTasks = [{ id: 't1', title: 'Task one', status: 'todo' }];
    mockQuery.mockResolvedValue({ rows: fakeTasks });
    const req = buildMockReq({ projectId: 'proj-1' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'GET', '/projects/:projectId/tasks');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(fakeTasks);
  });

  it('passes database errors to next()', async () => {
    // Arrange
    const router = buildRouter();
    const dbError = new Error('connection refused');
    mockQuery.mockRejectedValue(dbError);
    const req = buildMockReq({ projectId: 'proj-1' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'GET', '/projects/:projectId/tasks');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/tasks
// ---------------------------------------------------------------------------

describe('POST /projects/:projectId/tasks', () => {
  it('returns 400 when title is missing', async () => {
    // Arrange
    const router = buildRouter();
    const req = buildMockReq({ projectId: 'proj-1' }, { title: '' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'POST', '/projects/:projectId/tasks');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/title/i);
  });

  it('returns 400 when title is whitespace-only', async () => {
    const router = buildRouter();
    const req = buildMockReq({ projectId: 'proj-1' }, { title: '   ' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'POST', '/projects/:projectId/tasks');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('returns 201 with created task on success', async () => {
    // Arrange
    const router = buildRouter();
    const createdTask = { id: 't2', title: 'New task', status: 'todo' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })   // position query
      .mockResolvedValueOnce({ rows: [{ id: 't2' }] })       // INSERT
      .mockResolvedValueOnce({ rows: [createdTask] });        // SELECT with user JOIN

    const req = buildMockReq({ projectId: 'proj-1' }, { title: 'New task' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'POST', '/projects/:projectId/tasks');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdTask);
  });
});

// ---------------------------------------------------------------------------
// PUT /tasks/:id
// ---------------------------------------------------------------------------

describe('PUT /tasks/:id', () => {
  it('returns 400 when title is missing', async () => {
    const router = buildRouter();
    const req = buildMockReq({ id: 't1' }, {});
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PUT', '/tasks/:id');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('returns 404 when task does not exist', async () => {
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [] });
    const req = buildMockReq({ id: 't-missing' }, { title: 'Updated title' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PUT', '/tasks/:id');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('returns 200 with updated task on success', async () => {
    const router = buildRouter();
    const updatedTask = { id: 't1', title: 'Updated title', status: 'todo' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't1' }] })   // UPDATE
      .mockResolvedValueOnce({ rows: [updatedTask] });     // SELECT with user JOIN

    const req = buildMockReq({ id: 't1' }, { title: 'Updated title' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PUT', '/tasks/:id');
    await layer.route.stack[0].handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(updatedTask);
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/status
// ---------------------------------------------------------------------------

describe('PATCH /tasks/:id/status', () => {
  it('returns 400 for an invalid status value', async () => {
    const router = buildRouter();
    const req = buildMockReq({ id: 't1' }, { status: 'flying', position: 0 });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PATCH', '/tasks/:id/status');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/invalid status/i);
  });

  it('returns 400 for each invalid status boundary value', async () => {
    const invalidStatuses = ['', 'DONE', 'in progress', 'review'];

    for (const status of invalidStatuses) {
      const router = buildRouter();
      const req = buildMockReq({ id: 't1' }, { status, position: 0 });
      const res = buildMockRes();
      const next = vi.fn();

      const layer = findLayer(router, 'PATCH', '/tasks/:id/status');
      await layer.route.stack[0].handle(req, res, next);

      expect(next.mock.calls[0][0].status, `Expected 400 for status "${status}"`).toBe(400);
    }
  });

  it('accepts all valid status values', async () => {
    const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];

    for (const status of validStatuses) {
      const router = buildRouter();
      const task = { id: 't1', status, position: 0 };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [task] });

      const req = buildMockReq({ id: 't1' }, { status, position: 0 });
      const res = buildMockRes();
      const next = vi.fn();

      const layer = findLayer(router, 'PATCH', '/tasks/:id/status');
      await layer.route.stack[0].handle(req, res, next);

      expect(next, `next() should not be called for valid status "${status}"`).not.toHaveBeenCalled();
    }
  });

  it('returns 400 when position is missing', async () => {
    const router = buildRouter();
    const req = buildMockReq({ id: 't1' }, { status: 'done' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PATCH', '/tasks/:id/status');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/position/i);
  });

  it('returns 404 when task does not exist', async () => {
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [] });
    const req = buildMockReq({ id: 't-missing' }, { status: 'done', position: 1 });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PATCH', '/tasks/:id/status');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/assign
// ---------------------------------------------------------------------------

describe('PATCH /tasks/:id/assign', () => {
  it('returns 404 when task does not exist', async () => {
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [] });
    const req = buildMockReq({ id: 't-missing' }, { assigned_user_id: 'user-1' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PATCH', '/tasks/:id/assign');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('returns 200 with task when assignment succeeds', async () => {
    const router = buildRouter();
    const assignedTask = { id: 't1', assigned_user_id: 'user-1', assigned_user_name: 'Alice' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
      .mockResolvedValueOnce({ rows: [assignedTask] });

    const req = buildMockReq({ id: 't1' }, { assigned_user_id: 'user-1' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PATCH', '/tasks/:id/assign');
    await layer.route.stack[0].handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(assignedTask);
  });

  it('unassigns user when assigned_user_id is null', async () => {
    const router = buildRouter();
    const unassignedTask = { id: 't1', assigned_user_id: null, assigned_user_name: null };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
      .mockResolvedValueOnce({ rows: [unassignedTask] });

    const req = buildMockReq({ id: 't1' }, { assigned_user_id: null });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'PATCH', '/tasks/:id/assign');
    await layer.route.stack[0].handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(unassignedTask);
  });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id
// ---------------------------------------------------------------------------

describe('DELETE /tasks/:id', () => {
  it('returns 404 when task does not exist', async () => {
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [] });
    const req = buildMockReq({ id: 't-missing' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'DELETE', '/tasks/:id');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('returns 200 with deleted id on success', async () => {
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [{ id: 't1' }] });
    const req = buildMockReq({ id: 't1' });
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'DELETE', '/tasks/:id');
    await layer.route.stack[0].handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 't1' });
  });
});
