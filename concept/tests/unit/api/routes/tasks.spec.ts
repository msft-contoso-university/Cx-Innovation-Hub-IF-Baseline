import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

const mockQuery = vi.fn();

function createMockRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

async function loadTasksRouter() {
  delete require.cache[tasksModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksModulePath);
}

describe('tasks routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a missing title with a 400 error', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req = { params: { projectId: 'p1' }, body: { title: '   ' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates a task in the todo column at the next position', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', title: 'New task', status: 'todo', position: 2 }] });
      const req = { params: { projectId: 'p1' }, body: { title: 'New task' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 't1', title: 'New task', status: 'todo', position: 2 });
      expect(mockQuery.mock.calls[1][1]).toEqual(['p1', 'New task', null, 2, null]);
    });
  });

  describe('PUT /tasks/:id', () => {
    it('rejects a missing title with a 400 error', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'put', '/tasks/:id');
      const req = { params: { id: 't1' }, body: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns a 404 error when the task does not exist', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'put', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: 'missing' }, body: { title: 'Updated' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('updates the task title and description on success', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'put', '/tasks/:id');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', title: 'Updated', description: 'desc' }] });
      const req = { params: { id: 't1' }, body: { title: 'Updated', description: 'desc' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 't1', title: 'Updated', description: 'desc' });
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects an invalid status with a 400 error', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'bogus', position: 0 } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a missing position with a 400 error', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'done' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('assigns a user to a task', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: 'u1', assigned_user_name: 'Ada' }] });
      const req = { params: { id: 't1' }, body: { assigned_user_id: 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 't1']);
      expect(res.body).toEqual({ id: 't1', assigned_user_id: 'u1', assigned_user_name: 'Ada' });
    });

    it('unassigns a task when assigned_user_id is falsy', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: null }] });
      const req = { params: { id: 't1' }, body: { assigned_user_id: null } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery.mock.calls[0][1]).toEqual([null, 't1']);
    });

    it('returns a 404 error when the task does not exist', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: 'missing' }, body: { assigned_user_id: 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes a task and returns its id', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'delete', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
      const req = { params: { id: 't1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.body).toEqual({ message: 'Task deleted', id: 't1' });
    });

    it('returns a 404 error when the task does not exist', async () => {
      // Arrange
      const router = await loadTasksRouter();
      const handler = getHandler(router, 'delete', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: 'missing' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });
  });
});
