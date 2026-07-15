import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

// Captured route handlers
const handlers: Record<string, (...args: any[]) => Promise<void>> = {};

let mockPool: { query: ReturnType<typeof vi.fn> };

function makeRouterStub() {
  const stub: any = {
    get: (path: string, fn: (...a: any[]) => any) => { handlers[`GET ${path}`] = fn; return stub; },
    post: (path: string, fn: (...a: any[]) => any) => { handlers[`POST ${path}`] = fn; return stub; },
    put: (path: string, fn: (...a: any[]) => any) => { handlers[`PUT ${path}`] = fn; return stub; },
    patch: (path: string, fn: (...a: any[]) => any) => { handlers[`PATCH ${path}`] = fn; return stub; },
    delete: (path: string, fn: (...a: any[]) => any) => { handlers[`DELETE ${path}`] = fn; return stub; },
  };
  return stub;
}

beforeAll(() => {
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return { Router: makeRouterStub };
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[tasksRoutePath];
  require(tasksRoutePath);

  Module._load = originalLoad;
});

afterAll(() => {
  Module._load = originalLoad;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPool = { query: vi.fn() };
});

function makeRes() {
  const res: any = { status: vi.fn(() => res), json: vi.fn() };
  return res;
}

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/status
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/status', () => {
  it('returns 400 when status is missing', async () => {
    // Arrange
    const req: any = { params: { id: '1' }, body: { position: 0 } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/invalid status/i);
  });

  it('returns 400 when status is not in the valid set', async () => {
    // Arrange
    const req: any = { params: { id: '1' }, body: { status: 'cancelled', position: 0 } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('returns 400 when position is missing', async () => {
    // Arrange
    const req: any = { params: { id: '1' }, body: { status: 'done' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/position is required/i);
  });

  it('returns 404 when task is not found', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [] });
    const req: any = { params: { id: 'missing' }, body: { status: 'done', position: 1 } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/task not found/i);
  });

  it('accepts all valid status values and returns the updated task', async () => {
    // Arrange
    const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];
    const task = { id: '42', status: 'done', assigned_user_name: null, assigned_user_avatar_color: null };

    for (const status of validStatuses) {
      mockPool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: '42' }] })  // UPDATE
        .mockResolvedValueOnce({ rows: [task] });          // SELECT with user join
      const req: any = { params: { id: '42' }, body: { status, position: 0 } };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handlers['PATCH /tasks/:id/status']!(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(task);
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /tasks/:id
// ---------------------------------------------------------------------------
describe('PUT /tasks/:id', () => {
  it('returns 400 when title is missing', async () => {
    // Arrange
    const req: any = { params: { id: '1' }, body: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /tasks/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title is required/i);
  });

  it('returns 400 when title is whitespace only', async () => {
    // Arrange
    const req: any = { params: { id: '1' }, body: { title: '  ' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /tasks/:id']!(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('returns 404 when task is not found', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [] });
    const req: any = { params: { id: 'missing' }, body: { title: 'Fix bug' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /tasks/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('updates a task and returns it with user details', async () => {
    // Arrange
    const updatedTask = { id: '5', title: 'Fixed', assigned_user_name: 'Alice', assigned_user_avatar_color: 'blue' };
    mockPool.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: '5' }] })       // UPDATE
      .mockResolvedValueOnce({ rows: [updatedTask] });       // SELECT with join
    const req: any = { params: { id: '5' }, body: { title: 'Fixed', description: 'desc' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /tasks/:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(updatedTask);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/tasks
// ---------------------------------------------------------------------------
describe('POST /projects/:projectId/tasks', () => {
  it('returns 400 when title is missing', async () => {
    // Arrange
    const req: any = { params: { projectId: 'proj-1' }, body: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /projects/:projectId/tasks']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title is required/i);
  });

  it('creates a task and returns 201', async () => {
    // Arrange
    const newTask = { id: 'task-1', title: 'New task', assigned_user_name: null, assigned_user_avatar_color: null };
    mockPool.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })   // position query
      .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })  // INSERT
      .mockResolvedValueOnce({ rows: [newTask] });           // SELECT with join
    const req: any = { params: { projectId: 'proj-1' }, body: { title: 'New task' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /projects/:projectId/tasks']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newTask);
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/assign
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/assign', () => {
  it('returns 404 when task is not found', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [] });
    const req: any = { params: { id: 'missing' }, body: { assigned_user_id: 'user-1' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/assign']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('assigns a user to a task and returns the updated task', async () => {
    // Arrange
    const task = { id: '9', assigned_user_id: 'user-1', assigned_user_name: 'Bob' };
    mockPool.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: '9' }] })  // UPDATE
      .mockResolvedValueOnce({ rows: [task] });         // SELECT with join
    const req: any = { params: { id: '9' }, body: { assigned_user_id: 'user-1' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/assign']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(task);
  });

  it('unassigns a user when assigned_user_id is null', async () => {
    // Arrange
    const task = { id: '9', assigned_user_id: null, assigned_user_name: null };
    mockPool.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: '9' }] })
      .mockResolvedValueOnce({ rows: [task] });
    const req: any = { params: { id: '9' }, body: { assigned_user_id: null } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/assign']!(req, res, next);

    // Assert
    const [, params] = mockPool.query.mock.calls[0];
    expect(params[0]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id
// ---------------------------------------------------------------------------
describe('DELETE /tasks/:id', () => {
  it('returns 404 when task is not found', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [] });
    const req: any = { params: { id: 'missing' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['DELETE /tasks/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('deletes a task and returns confirmation', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [{ id: 'task-5' }] });
    const req: any = { params: { id: 'task-5' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['DELETE /tasks/:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 'task-5' });
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId/tasks
// ---------------------------------------------------------------------------
describe('GET /projects/:projectId/tasks', () => {
  it('returns tasks for a project', async () => {
    // Arrange
    const rows = [{ id: 't1', title: 'Task one', status: 'todo' }];
    mockPool.query = vi.fn().mockResolvedValue({ rows });
    const req: any = { params: { projectId: 'proj-1' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['GET /projects/:projectId/tasks']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(rows);
  });
});
