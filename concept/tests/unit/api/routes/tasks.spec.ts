import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

type Handler = (req: any, res: any, next: any) => Promise<void> | void;

const query = vi.fn();

function createRouterStub(routes: Map<string, Handler>) {
  const register = (method: string) => (path: string, handler: Handler) => {
    routes.set(`${method} ${path}`, handler);
  };

  return {
    get: register('GET'),
    post: register('POST'),
    put: register('PUT'),
    patch: register('PATCH'),
    delete: register('DELETE'),
  };
}

function loadTasksRoutes(): Map<string, Handler> {
  const routes = new Map<string, Handler>();

  delete require.cache[tasksModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => createRouterStub(routes) };
    }

    if (request === '../services/database') {
      return { getPool: () => ({ query }) };
    }

    return originalLoad(request, parent, isMain);
  };

  require(tasksModulePath);

  return routes;
}

function createResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('tasks routes', () => {
  let routes: Map<string, Handler>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = loadTasksRoutes();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  it('rejects task creation when the title is only whitespace', async () => {
    // Arrange
    const handler = routes.get('POST /projects/:projectId/tasks')!;
    const next = vi.fn();

    // Act
    await handler({ params: { projectId: '1' }, body: { title: '   ' } }, createResponse(), next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 400,
      message: 'Task title is required',
    });
  });

  it('trims the title and stores the next todo position when creating a task', async () => {
    // Arrange
    const handler = routes.get('POST /projects/:projectId/tasks')!;
    query
      .mockResolvedValueOnce({ rows: [{ next_pos: 7 }] })
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })
      .mockResolvedValueOnce({ rows: [{ id: 42, title: 'Ship it' }] });
    const res = createResponse();

    // Act
    await handler(
      { params: { projectId: '9' }, body: { title: '  Ship it  ' } },
      res,
      vi.fn()
    );

    // Assert
    expect(query.mock.calls[1][1]).toEqual(['9', 'Ship it', null, 7, null]);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 42, title: 'Ship it' });
  });

  it('rejects a status change with an unsupported status value', async () => {
    // Arrange
    const handler = routes.get('PATCH /tasks/:id/status')!;
    const next = vi.fn();

    // Act
    await handler(
      { params: { id: '1' }, body: { status: 'archived', position: 0 } },
      createResponse(),
      next
    );

    // Assert
    expect(query).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
    expect(next.mock.calls[0][0].message).toContain('Invalid status');
  });

  it('accepts position 0 as a valid boundary when changing status', async () => {
    // Arrange
    const handler = routes.get('PATCH /tasks/:id/status')!;
    query
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, status: 'done', position: 0 }] });
    const res = createResponse();
    const next = vi.fn();

    // Act
    await handler({ params: { id: '3' }, body: { status: 'done', position: 0 } }, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(query.mock.calls[0][1]).toEqual(['done', 0, '3']);
    expect(res.body).toEqual({ id: 3, status: 'done', position: 0 });
  });

  it('rejects a status change without a position', async () => {
    // Arrange
    const handler = routes.get('PATCH /tasks/:id/status')!;
    const next = vi.fn();

    // Act
    await handler({ params: { id: '1' }, body: { status: 'todo' } }, createResponse(), next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 400,
      message: 'Position is required',
    });
  });

  it('returns 404 when updating a task that does not exist', async () => {
    // Arrange
    const handler = routes.get('PUT /tasks/:id')!;
    query.mockResolvedValueOnce({ rows: [] });
    const next = vi.fn();

    // Act
    await handler({ params: { id: '404' }, body: { title: 'New title' } }, createResponse(), next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 404,
      message: 'Task not found',
    });
  });

  it('unassigns a task when assigned_user_id is null', async () => {
    // Arrange
    const handler = routes.get('PATCH /tasks/:id/assign')!;
    query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, assigned_user_id: null }] });
    const res = createResponse();

    // Act
    await handler({ params: { id: '5' }, body: { assigned_user_id: null } }, res, vi.fn());

    // Assert
    expect(query.mock.calls[0][1]).toEqual([null, '5']);
    expect(res.body).toEqual({ id: 5, assigned_user_id: null });
  });

  it('returns 404 when deleting a task that does not exist', async () => {
    // Arrange
    const handler = routes.get('DELETE /tasks/:id')!;
    query.mockResolvedValueOnce({ rows: [] });
    const next = vi.fn();

    // Act
    await handler({ params: { id: '404' }, body: {} }, createResponse(), next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 404,
      message: 'Task not found',
    });
  });

  it('forwards database failures to the error handler', async () => {
    // Arrange
    const handler = routes.get('GET /projects/:projectId/tasks')!;
    const failure = new Error('connection lost');
    query.mockRejectedValueOnce(failure);
    const next = vi.fn();

    // Act
    await handler({ params: { projectId: '1' } }, createResponse(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(failure);
  });
});
