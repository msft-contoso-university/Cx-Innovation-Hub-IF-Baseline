import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const realExpress = require('express');

const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databaseServicePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();

function createMockRes() {
  const res: {
    statusCode: number;
    body?: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => typeof res;
  } = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function loadTasksRouter() {
  delete require.cache[tasksRoutePath];
  delete require.cache[databaseServicePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return realExpress;
    }
    if (request === '../services/database' || request === './services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  const router = require(tasksRoutePath);
  return router;
}

function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

describe('tasks routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  it('POST /projects/:projectId/tasks rejects a missing title', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks');
    const req = { params: { projectId: '1' }, body: { title: '   ' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toBe('Task title is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST /projects/:projectId/tasks creates a task with the next position', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next_pos: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, title: 'New Task', status: 'todo' }] });
    const req = { params: { projectId: '1' }, body: { title: 'New Task' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 10, title: 'New Task', status: 'todo' });
  });

  it('PUT /tasks/:id returns 404 when the task does not exist', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'put', '/tasks/:id');
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: '999' }, body: { title: 'Updated title' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('PATCH /tasks/:id/status rejects an invalid status', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'patch', '/tasks/:id/status');
    const req = { params: { id: '1' }, body: { status: 'bogus', position: 0 } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('PATCH /tasks/:id/status rejects a missing position', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'patch', '/tasks/:id/status');
    const req = { params: { id: '1' }, body: { status: 'todo' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('PATCH /tasks/:id/assign unassigns a task when assigned_user_id is falsy', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'patch', '/tasks/:id/assign');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, assigned_user_id: null }] });
    const req = { params: { id: '1' }, body: { assigned_user_id: null } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(mockQuery.mock.calls[0][1]).toEqual([null, '1']);
    expect(res.body).toEqual({ id: 1, assigned_user_id: null });
  });

  it('DELETE /tasks/:id returns 404 when the task does not exist', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'delete', '/tasks/:id');
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: '999' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('DELETE /tasks/:id deletes an existing task', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'delete', '/tasks/:id');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const req = { params: { id: '5' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toEqual({ message: 'Task deleted', id: 5 });
  });

  it('propagates database errors to next()', async () => {
    // Arrange
    const router = loadTasksRouter();
    const handler = findHandler(router, 'delete', '/tasks/:id');
    const dbError = new Error('connection lost');
    mockQuery.mockRejectedValueOnce(dbError);
    const req = { params: { id: '5' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});
