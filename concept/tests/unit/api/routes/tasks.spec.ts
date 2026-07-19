import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type HandlerMap = Record<string, Function>;

function makeRes() {
  const mockJson = vi.fn();
  const mockStatus = vi.fn(() => ({ json: mockJson }));
  return { res: { status: mockStatus, json: mockJson }, mockStatus, mockJson };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('tasks route', () => {
  let handlers: HandlerMap;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handlers = {};
    mockQuery = vi.fn();

    delete require.cache[tasksModulePath];

    Module._load = (request: string, parent: unknown, isMain: boolean) => {
      if (request === 'express') {
        return {
          Router: () => {
            const router: any = {};
            for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
              router[method] = (path: string, handler: Function) => {
                handlers[`${method.toUpperCase()} ${path}`] = handler;
              };
            }
            return router;
          },
        };
      }
      if (request === '../services/database') {
        return { getPool: () => ({ query: mockQuery }) };
      }
      return originalLoad(request, parent, isMain);
    };

    require(tasksModulePath);
  });

  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[tasksModulePath];
  });

  // -------------------------------------------------------------------------
  // POST /projects/:projectId/tasks
  // -------------------------------------------------------------------------
  describe('POST /projects/:projectId/tasks', () => {
    const handlerKey = 'POST /projects/:projectId/tasks';

    it('calls next with 400 when title is absent', async () => {
      // Arrange
      const req = { body: {}, params: { projectId: 'proj-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Task title is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when title is whitespace only', async () => {
      // Arrange
      const req = { body: { title: '   ' }, params: { projectId: 'proj-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates task and responds with 201 when title is valid', async () => {
      // Arrange – two queries: position lookup, insert, then select-with-user
      const newTask = { id: 'task-uuid', title: 'Fix bug', status: 'todo' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
        .mockResolvedValueOnce({ rows: [newTask] })
        .mockResolvedValueOnce({ rows: [{ ...newTask, assigned_user_name: null }] });

      const req = { body: { title: 'Fix bug' }, params: { projectId: 'proj-1' } };
      const { res, mockStatus, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PUT /tasks/:id
  // -------------------------------------------------------------------------
  describe('PUT /tasks/:id', () => {
    const handlerKey = 'PUT /tasks/:id';

    it('calls next with 400 when title is absent', async () => {
      // Arrange
      const req = { body: {}, params: { id: 'task-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Task title is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = { body: { title: 'Updated title' }, params: { id: 'missing-task' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
      expect(next.mock.calls[0][0].message).toBe('Task not found');
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tasks/:id/status
  // -------------------------------------------------------------------------
  describe('PATCH /tasks/:id/status', () => {
    const handlerKey = 'PATCH /tasks/:id/status';

    it('calls next with 400 when status is not a valid value', async () => {
      // Arrange
      const req = { body: { status: 'flying', position: 0 }, params: { id: 'task-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when status is absent', async () => {
      // Arrange
      const req = { body: { position: 1 }, params: { id: 'task-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when position is null', async () => {
      // Arrange
      const req = { body: { status: 'done', position: null }, params: { id: 'task-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Position is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when position is undefined', async () => {
      // Arrange
      const req = { body: { status: 'in_progress' }, params: { id: 'task-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Position is required');
    });

    it('accepts position 0 as a valid position (boundary)', async () => {
      // Arrange – position = 0 is the first slot and must NOT be rejected
      const updated = { id: 'task-1', status: 'todo', position: 0 };
      mockQuery
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [{ ...updated, assigned_user_name: null }] });

      const req = { body: { status: 'todo', position: 0 }, params: { id: 'task-1' } };
      const { res, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalled();
    });

    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = { body: { status: 'done', position: 1 }, params: { id: 'missing' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tasks/:id/assign
  // -------------------------------------------------------------------------
  describe('PATCH /tasks/:id/assign', () => {
    const handlerKey = 'PATCH /tasks/:id/assign';

    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = { body: { assigned_user_id: 'user-1' }, params: { id: 'missing' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('assigns user and returns updated task', async () => {
      // Arrange
      const updated = { id: 'task-1', assigned_user_id: 'user-1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [{ ...updated, assigned_user_name: 'Alice' }] });

      const req = { body: { assigned_user_id: 'user-1' }, params: { id: 'task-1' } };
      const { res, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(mockJson).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /tasks/:id
  // -------------------------------------------------------------------------
  describe('DELETE /tasks/:id', () => {
    const handlerKey = 'DELETE /tasks/:id';

    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = { params: { id: 'nonexistent' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('deletes the task and returns confirmation', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });

      const req = { params: { id: 'task-1' } };
      const { res, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(mockJson).toHaveBeenCalledWith({ message: 'Task deleted', id: 'task-1' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
