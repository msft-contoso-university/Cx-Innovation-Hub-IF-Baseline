import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksRouterPath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databasePath = require.resolve('../../../../apps/api/src/services/database.js');

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
const mockDatabase = { getPool: () => mockPool };

interface RouterHandlers {
  [key: string]: (req: any, res: any, next: any) => Promise<void>;
}

interface MockRouter extends RouterHandlers {
  get: (path: string, handler: Function) => void;
  post: (path: string, handler: Function) => void;
  put: (path: string, handler: Function) => void;
  patch: (path: string, handler: Function) => void;
  delete: (path: string, handler: Function) => void;
}

let mockRouter: MockRouter;

function createMockRouter(): MockRouter {
  const handlers: RouterHandlers = {};
  const router = handlers as MockRouter;
  router.get = (path: string, handler: Function) => { handlers[`GET:${path}`] = handler as any; };
  router.post = (path: string, handler: Function) => { handlers[`POST:${path}`] = handler as any; };
  router.put = (path: string, handler: Function) => { handlers[`PUT:${path}`] = handler as any; };
  router.patch = (path: string, handler: Function) => { handlers[`PATCH:${path}`] = handler as any; };
  router.delete = (path: string, handler: Function) => { handlers[`DELETE:${path}`] = handler as any; };
  return router;
}

function makeMocks(overrides: { body?: object; params?: object } = {}) {
  const req = { body: overrides.body ?? {}, params: overrides.params ?? {}, headers: {} } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  return { req, res, next };
}

function loadRouter() {
  mockRouter = createMockRouter();
  delete require.cache[tasksRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databasePath) {
        return mockDatabase;
      }
    } catch {
      // unresolvable – fall through
    }
    return originalLoad(request, parent, isMain);
  };

  require(tasksRouterPath);
}

describe('tasks routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // PATCH /tasks/:id/status — status and position validation
  // -------------------------------------------------------------------------
  describe('PATCH /tasks/:id/status', () => {
    const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done'];

    it('calls next with 400 when status is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({ body: { position: 0 }, params: { id: '1' } });

      // Act
      await mockRouter['PATCH:/tasks/:id/status']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 400 when status is not a valid value', async () => {
      // Arrange
      const { req, res, next } = makeMocks({
        body: { status: 'pending', position: 0 },
        params: { id: '1' },
      });

      // Act
      await mockRouter['PATCH:/tasks/:id/status']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 400 when position is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({
        body: { status: 'todo' },
        params: { id: '1' },
      });

      // Act
      await mockRouter['PATCH:/tasks/:id/status']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 400 when position is null', async () => {
      // Arrange
      const { req, res, next } = makeMocks({
        body: { status: 'todo', position: null },
        params: { id: '1' },
      });

      // Act
      await mockRouter['PATCH:/tasks/:id/status']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it.each(VALID_STATUSES)('accepts valid status "%s" with position 0', async (status) => {
      // Arrange
      const task = { id: 1, status, position: 0 };
      mockQuery
        .mockResolvedValueOnce({ rows: [task] })     // UPDATE
        .mockResolvedValueOnce({ rows: [task] });    // SELECT with user details
      const { req, res, next } = makeMocks({
        body: { status, position: 0 },
        params: { id: '1' },
      });

      // Act
      await mockRouter['PATCH:/tasks/:id/status']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(task);
    });

    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeMocks({
        body: { status: 'done', position: 1 },
        params: { id: '999' },
      });

      // Act
      await mockRouter['PATCH:/tasks/:id/status']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  // -------------------------------------------------------------------------
  // PUT /tasks/:id — title validation
  // -------------------------------------------------------------------------
  describe('PUT /tasks/:id', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({ body: {}, params: { id: '1' } });

      // Act
      await mockRouter['PUT:/tasks/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 400 when title is whitespace only', async () => {
      // Arrange
      const { req, res, next } = makeMocks({ body: { title: '  ' }, params: { id: '1' } });

      // Act
      await mockRouter['PUT:/tasks/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeMocks({
        body: { title: 'Updated title' },
        params: { id: '999' },
      });

      // Act
      await mockRouter['PUT:/tasks/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('returns updated task when title is valid', async () => {
      // Arrange
      const task = { id: 1, title: 'Updated title' };
      mockQuery
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [task] });
      const { req, res, next } = makeMocks({
        body: { title: 'Updated title' },
        params: { id: '1' },
      });

      // Act
      await mockRouter['PUT:/tasks/:id']?.(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(task);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /projects/:projectId/tasks — title validation
  // -------------------------------------------------------------------------
  describe('POST /projects/:projectId/tasks', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({ body: {}, params: { projectId: '1' } });

      // Act
      await mockRouter['POST:/projects/:projectId/tasks']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 400 when title is whitespace only', async () => {
      // Arrange
      const { req, res, next } = makeMocks({ body: { title: '   ' }, params: { projectId: '1' } });

      // Act
      await mockRouter['POST:/projects/:projectId/tasks']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 201 with new task when title is valid', async () => {
      // Arrange
      const task = { id: 5, title: 'New task', status: 'todo' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })  // position query
        .mockResolvedValueOnce({ rows: [task] })             // INSERT
        .mockResolvedValueOnce({ rows: [task] });            // SELECT with user details
      const { req, res, next } = makeMocks({
        body: { title: 'New task' },
        params: { projectId: '1' },
      });

      // Act
      await mockRouter['POST:/projects/:projectId/tasks']?.(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(task);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tasks/:id/assign — assign/unassign
  // -------------------------------------------------------------------------
  describe('PATCH /tasks/:id/assign', () => {
    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeMocks({
        body: { assigned_user_id: 'user-1' },
        params: { id: '999' },
      });

      // Act
      await mockRouter['PATCH:/tasks/:id/assign']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('unassigns user when assigned_user_id is null', async () => {
      // Arrange
      const task = { id: 1, assigned_user_id: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [task] });
      const { req, res, next } = makeMocks({
        body: { assigned_user_id: null },
        params: { id: '1' },
      });

      // Act
      await mockRouter['PATCH:/tasks/:id/assign']?.(req, res, next);

      // Assert
      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBeNull();
      expect(res.json).toHaveBeenCalledWith(task);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /tasks/:id
  // -------------------------------------------------------------------------
  describe('DELETE /tasks/:id', () => {
    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeMocks({ params: { id: '999' } });

      // Act
      await mockRouter['DELETE:/tasks/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('returns delete confirmation when task is found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });
      const { req, res, next } = makeMocks({ params: { id: '1' } });

      // Act
      await mockRouter['DELETE:/tasks/:id']?.(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Task deleted' }));
      expect(next).not.toHaveBeenCalled();
    });
  });
});
