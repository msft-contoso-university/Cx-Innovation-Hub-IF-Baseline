import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

const mockQuery = vi.fn();

type MockRequest = {
  params: Record<string, string>;
  body: Record<string, unknown>;
};

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

function createMockRes(): MockResponse {
  const res: Partial<MockResponse> = {
    statusCode: 200,
  };
  res.status = function status(code: number) {
    res.statusCode = code;
    return res as MockResponse;
  };
  res.json = function json(payload: unknown) {
    res.body = payload;
    return res as MockResponse;
  };
  return res as MockResponse;
}

function loadTasksRouter() {
  delete require.cache[tasksModulePath];

  Module._load = (request: string, parent: { filename?: string } | null, isMain: boolean) => {
    if (request === '../services/database' && parent?.filename === tasksModulePath) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksModulePath);
}

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) {
    throw new Error(`No route found for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

async function invoke(handler: any, req: MockRequest) {
  const res = createMockRes();
  const next = vi.fn();
  await handler(req, res, next);
  return { res, next };
}

describe('tasks routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('creates a task with a title (happy path)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', title: 'New task' }] });

      const req: MockRequest = {
        params: { projectId: 'p1' },
        body: { title: 'New task' },
      };

      // Act
      const { res, next } = await invoke(handler, req);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 't1', title: 'New task' });
    });

    it('returns 400 when title is missing (invalid input)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req: MockRequest = {
        params: { projectId: 'p1' },
        body: {},
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      expect(mockQuery).not.toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('Task title is required');
    });

    it('returns 400 when title is whitespace-only (edge case)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');
      const req: MockRequest = {
        params: { projectId: 'p1' },
        body: { title: '   ' },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('Task title is required');
    });
  });

  describe('PUT /tasks/:id', () => {
    it('returns 400 when title is missing (invalid input)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'put', '/tasks/:id');
      const req: MockRequest = { params: { id: 't1' }, body: {} };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      expect(mockQuery).not.toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('Task title is required');
    });

    it('returns 404 when the task does not exist (boundary condition)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'put', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req: MockRequest = { params: { id: 'missing' }, body: { title: 'Updated' } };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toBe('Task not found');
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('updates status and position (happy path)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1', status: 'in_progress', position: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', status: 'in_progress', position: 2 }] });

      const req: MockRequest = {
        params: { id: 't1' },
        body: { status: 'in_progress', position: 2 },
      };

      // Act
      const { res, next } = await invoke(handler, req);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 't1', status: 'in_progress', position: 2 });
    });

    it('returns 400 for an invalid status value (invalid input)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req: MockRequest = {
        params: { id: 't1' },
        body: { status: 'archived', position: 0 },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      expect(mockQuery).not.toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/Invalid status/);
    });

    it('returns 400 when position is missing (edge case)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      const req: MockRequest = {
        params: { id: 't1' },
        body: { status: 'todo' },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      expect(mockQuery).not.toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('Position is required');
    });

    it('returns 404 when the task does not exist (boundary condition)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/status');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req: MockRequest = {
        params: { id: 'missing' },
        body: { status: 'done', position: 0 },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toBe('Task not found');
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('assigns a user to a task (happy path)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: 'u2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: 'u2' }] });

      const req: MockRequest = {
        params: { id: 't1' },
        body: { assigned_user_id: 'u2' },
      };

      // Act
      const { res, next } = await invoke(handler, req);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 't1', assigned_user_id: 'u2' });
    });

    it('unassigns a task when assigned_user_id is null (edge case)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: null }] });

      const req: MockRequest = {
        params: { id: 't1' },
        body: { assigned_user_id: null },
      };

      // Act
      await invoke(handler, req);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('UPDATE tasks'), [
        null,
        't1',
      ]);
    });

    it('returns 404 when the task does not exist (boundary condition)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req: MockRequest = { params: { id: 'missing' }, body: { assigned_user_id: 'u1' } };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toBe('Task not found');
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes a task (happy path)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'delete', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
      const req: MockRequest = { params: { id: 't1' }, body: {} };

      // Act
      const { res, next } = await invoke(handler, req);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ message: 'Task deleted', id: 't1' });
    });

    it('returns 404 when the task does not exist (boundary condition)', async () => {
      // Arrange
      const router = loadTasksRouter();
      const handler = getHandler(router, 'delete', '/tasks/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req: MockRequest = { params: { id: 'missing' }, body: {} };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toBe('Task not found');
    });
  });
});
