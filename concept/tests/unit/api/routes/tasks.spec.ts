/**
 * Unit tests for the tasks route handler.
 *
 * Covers: VALID_STATUSES boundary enforcement (PATCH status), title
 * validation (POST/PUT), 404 handling (PUT/PATCH/DELETE), and the
 * happy-path for all six task endpoints.
 *
 * Uses the Module._load interception pattern (CommonJS mocking).
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');
// Resolve express from the test package's own node_modules
const expressPath = require.resolve('express');

// --------------------------------------------------------------------------
// Shared mocks
// --------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

async function loadTasksRouter() {
  delete require.cache[tasksRoutePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return originalLoad(expressPath, parent, isMain);
    }
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    if (request === '../middleware/errorHandler') {
      return originalLoad(errorHandlerPath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksRoutePath);
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function makeReq(overrides: Record<string, unknown> = {}) {
  return { params: {}, body: {}, headers: {}, ...overrides };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
  };
  return res;
}

function findRoute(
  router: ReturnType<typeof require>,
  path: string,
  method: string
) {
  return router.stack.find(
    (l: { route: { path: string; methods: Record<string, boolean> } }) =>
      l.route?.path === path && l.route.methods[method]
  );
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
describe('tasks route', () => {
  let router: ReturnType<typeof require>;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadTasksRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -----------------------------------------------------------------------
  // GET /projects/:projectId/tasks
  // -----------------------------------------------------------------------
  describe('GET /projects/:projectId/tasks', () => {
    it('returns tasks array on success', async () => {
      // Arrange
      const fakeTasks = [{ id: 1, title: 'Task A', status: 'todo' }];
      mockQuery.mockResolvedValueOnce({ rows: fakeTasks });

      const req = makeReq({ params: { projectId: '42' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/projects/:projectId/tasks', 'get');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.body).toEqual(fakeTasks);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next with error on db failure', async () => {
      // Arrange
      const dbErr = new Error('timeout');
      mockQuery.mockRejectedValueOnce(dbErr);

      const req = makeReq({ params: { projectId: '42' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/projects/:projectId/tasks', 'get');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbErr);
    });
  });

  // -----------------------------------------------------------------------
  // POST /projects/:projectId/tasks
  // -----------------------------------------------------------------------
  describe('POST /projects/:projectId/tasks', () => {
    it('returns 400 when title is missing', async () => {
      // Arrange
      const req = makeReq({ params: { projectId: '42' }, body: {} });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/projects/:projectId/tasks', 'post');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when title is blank', async () => {
      // Arrange
      const req = makeReq({ params: { projectId: '42' }, body: { title: '   ' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/projects/:projectId/tasks', 'post');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
    });

    it('creates task and returns 201 on success', async () => {
      // Arrange
      const posRow = { next_pos: 0 };
      const insertedRow = { id: 77 };
      const fullTask = { id: 77, title: 'New Task', status: 'todo', assigned_user_name: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [posRow] })    // position query
        .mockResolvedValueOnce({ rows: [insertedRow] }) // INSERT
        .mockResolvedValueOnce({ rows: [fullTask] });   // SELECT with JOIN

      const req = makeReq({ params: { projectId: '42' }, body: { title: 'New Task' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/projects/:projectId/tasks', 'post');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(fullTask);
      expect(next).not.toHaveBeenCalled();
    });

    it('trims whitespace from task title before inserting', async () => {
      // Arrange
      const posRow = { next_pos: 1 };
      const insertedRow = { id: 78 };
      const fullTask = { id: 78, title: 'Trimmed Title', status: 'todo' };
      mockQuery
        .mockResolvedValueOnce({ rows: [posRow] })
        .mockResolvedValueOnce({ rows: [insertedRow] })
        .mockResolvedValueOnce({ rows: [fullTask] });

      const req = makeReq({
        params: { projectId: '42' },
        body: { title: '  Trimmed Title  ' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/projects/:projectId/tasks', 'post');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert — INSERT query receives trimmed title
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[1]).toContain('Trimmed Title');
      expect(insertCall[1]).not.toContain('  Trimmed Title  ');
    });
  });

  // -----------------------------------------------------------------------
  // PUT /tasks/:id
  // -----------------------------------------------------------------------
  describe('PUT /tasks/:id', () => {
    it('returns 400 when title is missing', async () => {
      // Arrange
      const req = makeReq({ params: { id: '1' }, body: {} });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id', 'put');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Task title is required' })
      );
    });

    it('returns 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows

      const req = makeReq({ params: { id: '999' }, body: { title: 'X' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id', 'put');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });

    it('updates task and returns it on success', async () => {
      // Arrange
      const updatedRow = { id: 1 };
      const fullTask = { id: 1, title: 'Updated', description: null, assigned_user_name: 'Alice' };
      mockQuery
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [fullTask] });

      const req = makeReq({ params: { id: '1' }, body: { title: 'Updated' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id', 'put');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(res.body).toEqual(fullTask);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /tasks/:id/status
  // -----------------------------------------------------------------------
  describe('PATCH /tasks/:id/status', () => {
    const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done'];

    it.each(VALID_STATUSES)('accepts valid status "%s"', async (status) => {
      // Arrange
      const updatedRow = { id: 5 };
      const fullTask = { id: 5, status };
      mockQuery
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [fullTask] });

      const req = makeReq({ params: { id: '5' }, body: { status, position: 0 } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/status', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual(fullTask);
    });

    it('returns 400 for invalid status value', async () => {
      // Arrange
      const req = makeReq({ params: { id: '5' }, body: { status: 'archived', position: 0 } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/status', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

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
      const req = makeReq({ params: { id: '5' }, body: { position: 0 } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/status', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 })
      );
    });

    it('returns 400 when position is missing', async () => {
      // Arrange
      const req = makeReq({ params: { id: '5' }, body: { status: 'todo' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/status', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Position is required' })
      );
    });

    it('accepts position 0 (falsy but valid)', async () => {
      // Arrange — position 0 must not trigger the "required" check
      const updatedRow = { id: 5 };
      const fullTask = { id: 5, status: 'todo', position: 0 };
      mockQuery
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [fullTask] });

      const req = makeReq({ params: { id: '5' }, body: { status: 'todo', position: 0 } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/status', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = makeReq({ params: { id: '999' }, body: { status: 'done', position: 1 } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/status', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /tasks/:id/assign
  // -----------------------------------------------------------------------
  describe('PATCH /tasks/:id/assign', () => {
    it('returns 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = makeReq({ params: { id: '999' }, body: { assigned_user_id: 'u1' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/assign', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });

    it('assigns user and returns updated task', async () => {
      // Arrange
      const updatedRow = { id: 3 };
      const fullTask = { id: 3, assigned_user_id: 'u1', assigned_user_name: 'Alice' };
      mockQuery
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [fullTask] });

      const req = makeReq({ params: { id: '3' }, body: { assigned_user_id: 'u1' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/assign', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(res.body).toEqual(fullTask);
      expect(next).not.toHaveBeenCalled();
    });

    it('unassigns user when assigned_user_id is null', async () => {
      // Arrange
      const updatedRow = { id: 3 };
      const fullTask = { id: 3, assigned_user_id: null, assigned_user_name: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [fullTask] });

      const req = makeReq({ params: { id: '3' }, body: { assigned_user_id: null } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id/assign', 'patch');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(res.body).toEqual(fullTask);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /tasks/:id
  // -----------------------------------------------------------------------
  describe('DELETE /tasks/:id', () => {
    it('returns 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = makeReq({ params: { id: '999' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id', 'delete');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Task not found' })
      );
    });

    it('deletes task and returns confirmation', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: '7' }] });

      const req = makeReq({ params: { id: '7' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id', 'delete');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(res.body).toEqual({ message: 'Task deleted', id: '7' });
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next with error on db failure', async () => {
      // Arrange
      const dbErr = new Error('query failed');
      mockQuery.mockRejectedValueOnce(dbErr);

      const req = makeReq({ params: { id: '7' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = findRoute(router, '/tasks/:id', 'delete');

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbErr);
    });
  });
});
