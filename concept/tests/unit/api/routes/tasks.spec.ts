import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

type RouteHandler = (req: any, res: any, next: any) => unknown | Promise<unknown>;

const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

/**
 * Creates a minimal Express-compatible mock so the real route module can be
 * loaded and its handlers invoked directly, without a running HTTP server.
 */
function createExpressMock() {
  const routes: Record<string, RouteHandler> = {};

  function Router() {
    const instance: Record<string, unknown> = {};
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      instance[method] = (path: string, handler: RouteHandler) => {
        routes[`${method} ${path}`] = handler;
      };
    }
    return instance;
  }

  return { Router, routes };
}

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function loadTasksRoutes(): Promise<Record<string, RouteHandler>> {
  delete require.cache[tasksModulePath];
  const { Router, routes } = createExpressMock();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router };
    }
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    return originalLoad(request, parent, isMain);
  };

  require(tasksModulePath);
  return routes;
}

describe('tasks routes', () => {
  let routes: Record<string, RouteHandler>;

  beforeEach(async () => {
    vi.clearAllMocks();
    routes = await loadTasksRoutes();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a task with a blank title', async () => {
      // Arrange
      const req = { params: { projectId: '1' }, body: { title: '   ' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['post /projects/:projectId/tasks'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates a task with the next todo position', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 2 }] }) // position lookup
        .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // insert
        .mockResolvedValueOnce({ rows: [{ id: 7, title: 'New task' }] }); // re-fetch with user
      const req = { params: { projectId: '1' }, body: { title: 'New task' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['post /projects/:projectId/tasks'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 7, title: 'New task' });
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO tasks'),
        ['1', 'New task', null, 2, null],
      );
    });
  });

  describe('PUT /tasks/:id', () => {
    it('rejects a missing title', async () => {
      // Arrange
      const req = { params: { id: '5' }, body: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['put /tasks/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: '999' }, body: { title: 'Updated title' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['put /tasks/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects an invalid status value', async () => {
      // Arrange
      const req = { params: { id: '5' }, body: { status: 'not_a_status', position: 0 } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['patch /tasks/:id/status'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a missing position', async () => {
      // Arrange
      const req = { params: { id: '5' }, body: { status: 'done' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['patch /tasks/:id/status'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: '999' }, body: { status: 'done', position: 0 } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['patch /tasks/:id/status'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('unassigns a task when assigned_user_id is null', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // update
        .mockResolvedValueOnce({ rows: [{ id: 5, assigned_user_id: null }] }); // re-fetch
      const req = { params: { id: '5' }, body: { assigned_user_id: null } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['patch /tasks/:id/assign'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE tasks SET assigned_user_id'),
        [null, '5'],
      );
      expect(res.json).toHaveBeenCalledWith({ id: 5, assigned_user_id: null });
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: '999' }, body: { assigned_user_id: '2' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['patch /tasks/:id/assign'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: '999' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['delete /tasks/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('deletes the task and returns its id', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
      const req = { params: { id: '5' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['delete /tasks/:id'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 5 });
    });
  });
});
