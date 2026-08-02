import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

const mockQuery = vi.fn();

function createExpressMock() {
  function Router() {
    const stack: any[] = [];
    const addRoute = (method: string) => (path: string, handler: Function) => {
      const existing = stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
      if (existing) {
        existing.route.stack.push({ handle: handler });
      } else {
        stack.push({ route: { path, methods: { [method]: true }, stack: [{ handle: handler }] } });
      }
    };
    const r: any = { stack, get: addRoute('get'), post: addRoute('post'), put: addRoute('put'), patch: addRoute('patch'), delete: addRoute('delete') };
    return r;
  }
  return { Router };
}

async function loadTasksRouter() {
  delete require.cache[tasksRoutePath];
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return createExpressMock();
    if (request === '../services/database' || request.endsWith('services/database.js')) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };
  return require(tasksRoutePath);
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnThis();
  return { json, status } as any;
}

function findHandler(router: any, method: string, pathMatch: string) {
  return router.stack.find(
    (l: any) => l.route?.methods?.[method] && l.route?.path?.includes(pathMatch)
  )?.route?.stack[0]?.handle;
}

describe('POST /api/projects/:projectId/tasks', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when title is missing', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'post', 'tasks');
    const next = vi.fn();

    // Act
    await handler({ params: { projectId: '1' }, body: {} }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Task title is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 400 when title is blank/whitespace', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'post', 'tasks');
    const next = vi.fn();

    // Act
    await handler({ params: { projectId: '1' }, body: { title: '   ' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Task title is required' }));
  });

  it('creates a task and returns 201 for a valid title', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'post', 'tasks');
    const next = vi.fn();
    const res = makeRes();
    const createdTask = { id: 'task-1', title: 'New Task', status: 'todo' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })       // position query
      .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })       // INSERT
      .mockResolvedValueOnce({ rows: [createdTask] });            // SELECT with user

    // Act
    await handler({ params: { projectId: 'proj-1' }, body: { title: 'New Task' } }, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdTask);
  });
});

describe('PUT /api/tasks/:id', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when title is missing', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'put', '/tasks/:id');
    const next = vi.fn();

    // Act
    await handler({ params: { id: 't-1' }, body: {} }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Task title is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 404 when task does not exist', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'put', '/tasks/:id');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    await handler({ params: { id: 'missing' }, body: { title: 'Valid' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Task not found' }));
    expect((next.mock.calls[0][0] as any).status).toBe(404);
  });

  it('updates the task and returns the updated row', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'put', '/tasks/:id');
    const next = vi.fn();
    const res = makeRes();
    const updatedTask = { id: 't-1', title: 'Updated', description: 'desc' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't-1' }] })
      .mockResolvedValueOnce({ rows: [updatedTask] });

    // Act
    await handler({ params: { id: 't-1' }, body: { title: 'Updated', description: 'desc' } }, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith(updatedTask);
  });
});

describe('PATCH /api/tasks/:id/status', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 for an invalid status value', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'patch', 'status');
    const next = vi.fn();

    // Act
    await handler({ params: { id: 't-1' }, body: { status: 'invalid', position: 0 } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid status') })
    );
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 400 when position is missing', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'patch', 'status');
    const next = vi.fn();

    // Act
    await handler({ params: { id: 't-1' }, body: { status: 'done' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Position is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 404 when task is not found', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'patch', 'status');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    await handler({ params: { id: 'missing' }, body: { status: 'done', position: 0 } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Task not found' }));
    expect((next.mock.calls[0][0] as any).status).toBe(404);
  });

  it('accepts all valid status values', async () => {
    // Arrange
    const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];

    for (const status of validStatuses) {
      vi.clearAllMocks();
      const router = await loadTasksRouter();
      const handler = findHandler(router, 'patch', 'status');
      const next = vi.fn();
      const res = makeRes();
      const task = { id: 't-1', status };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't-1' }] })
        .mockResolvedValueOnce({ rows: [task] });

      // Act
      await handler({ params: { id: 't-1' }, body: { status, position: 0 } }, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(task);
    }
  });
});

describe('PATCH /api/tasks/:id/assign', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 404 when task is not found', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'patch', 'assign');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    await handler({ params: { id: 'missing' }, body: { assigned_user_id: 'u-1' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Task not found' }));
    expect((next.mock.calls[0][0] as any).status).toBe(404);
  });

  it('assigns a user to a task successfully', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'patch', 'assign');
    const next = vi.fn();
    const res = makeRes();
    const task = { id: 't-1', assigned_user_id: 'u-1' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't-1' }] })
      .mockResolvedValueOnce({ rows: [task] });

    // Act
    await handler({ params: { id: 't-1' }, body: { assigned_user_id: 'u-1' } }, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith(task);
    expect(next).not.toHaveBeenCalled();
  });

  it('unassigns a user when assigned_user_id is omitted', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'patch', 'assign');
    const next = vi.fn();
    const res = makeRes();
    const task = { id: 't-1', assigned_user_id: null };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't-1' }] })
      .mockResolvedValueOnce({ rows: [task] });

    // Act
    await handler({ params: { id: 't-1' }, body: {} }, res, next);

    // Assert
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBeNull();
  });
});

describe('DELETE /api/tasks/:id', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 404 when task does not exist', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'delete', '/tasks/:id');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    await handler({ params: { id: 'missing' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Task not found' }));
    expect((next.mock.calls[0][0] as any).status).toBe(404);
  });

  it('deletes the task and returns success message', async () => {
    // Arrange
    const router = await loadTasksRouter();
    const handler = findHandler(router, 'delete', '/tasks/:id');
    const next = vi.fn();
    const res = makeRes();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't-1' }] });

    // Act
    await handler({ params: { id: 't-1' } }, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 't-1' });
    expect(next).not.toHaveBeenCalled();
  });
});
