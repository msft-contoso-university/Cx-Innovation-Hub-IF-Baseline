import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

let mockQuery: ReturnType<typeof vi.fn>;

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

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method] === true
  );
  return layer?.route?.stack?.[0]?.handle;
}

function makeReqRes() {
  const req: any = { params: {}, body: {}, headers: {} };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('tasks router', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
    router = await loadTasksRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ---------------------------------------------------------------------------
  // POST /projects/:projectId/tasks
  // ---------------------------------------------------------------------------
  describe('POST /projects/:projectId/tasks', () => {
    it('returns 400 when title is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { projectId: '1' };
      req.body = { description: 'No title here' };
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when title is whitespace only', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { projectId: '1' };
      req.body = { title: '   ' };
      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
    });

    it('creates a task and returns 201 on success', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { projectId: '42' };
      req.body = { title: 'New task' };

      const newTask = {
        id: 7, project_id: 42, title: 'New task', description: null,
        status: 'todo', position: 0, assigned_user_id: null,
        assigned_user_name: null, assigned_user_avatar_color: null,
      };

      // First query: get next position
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
        // Second query: insert task
        .mockResolvedValueOnce({ rows: [{ id: 7 }] })
        // Third query: fetch with user details
        .mockResolvedValueOnce({ rows: [newTask] });

      const handler = getHandler(router, 'post', '/projects/:projectId/tasks');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newTask);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /tasks/:id
  // ---------------------------------------------------------------------------
  describe('PUT /tasks/:id', () => {
    it('returns 400 when title is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '1' };
      req.body = { description: 'no title' };
      const handler = getHandler(router, 'put', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when title is empty string', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '1' };
      req.body = { title: '' };
      const handler = getHandler(router, 'put', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
    });

    it('returns 404 when task does not exist', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '99' };
      req.body = { title: 'Updated' };
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows
      const handler = getHandler(router, 'put', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /tasks/:id/status
  // ---------------------------------------------------------------------------
  describe('PATCH /tasks/:id/status', () => {
    it('returns 400 for an invalid status value', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '1' };
      req.body = { status: 'flying', position: 0 };
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining('Invalid status'),
        })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when status is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '1' };
      req.body = { position: 0 };
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: expect.stringContaining('Invalid status') })
      );
    });

    it('returns 400 when position is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '1' };
      req.body = { status: 'in_progress' };
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Position is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when position is null', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '1' };
      req.body = { status: 'done', position: null };
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Position is required' })
      );
    });

    it('accepts all valid status values', async () => {
      const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];

      for (const status of validStatuses) {
        vi.clearAllMocks();
        const updatedTask = { id: 1, status, position: 0, assigned_user_name: null };
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [updatedTask] });

        const { req, res, next } = makeReqRes();
        req.params = { id: '1' };
        req.body = { status, position: 0 };
        const handler = getHandler(router, 'patch', '/tasks/:id/status');

        await handler(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(updatedTask);
      }
    });

    it('returns 404 when task does not exist', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '99' };
      req.body = { status: 'done', position: 0 };
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getHandler(router, 'patch', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /tasks/:id/assign
  // ---------------------------------------------------------------------------
  describe('PATCH /tasks/:id/assign', () => {
    it('returns 404 when task does not exist', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '99' };
      req.body = { assigned_user_id: 'user-1' };
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });

    it('stores null when assigned_user_id is omitted (unassign)', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '1' };
      req.body = {}; // no assigned_user_id
      const updatedTask = { id: 1, assigned_user_id: null, assigned_user_name: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [updatedTask] });
      const handler = getHandler(router, 'patch', '/tasks/:id/assign');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      // First query must be called with null for unassign
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks'),
        [null, '1']
      );
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /tasks/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /tasks/:id', () => {
    it('returns 404 when task does not exist', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '99' };
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getHandler(router, 'delete', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });

    it('deletes a task and returns confirmation', async () => {
      // Arrange
      const { req, res, next } = makeReqRes();
      req.params = { id: '5' };
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
      const handler = getHandler(router, 'delete', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 5 });
    });
  });
});
