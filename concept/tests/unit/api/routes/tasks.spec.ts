import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------
let mockQuery: ReturnType<typeof vi.fn>;
let capturedHandlers: Record<string, (...args: unknown[]) => Promise<void>>;

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn();
  return res;
}

async function loadRoute() {
  capturedHandlers = {};
  delete require.cache[tasksRoutePath];

  const mockRouter: Record<string, unknown> = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    mockRouter[method] = vi.fn((path: string, handler: (...args: unknown[]) => Promise<void>) => {
      capturedHandlers[`${method.toUpperCase()} ${path}`] = handler;
    });
  }

  mockQuery = vi.fn();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  require(tasksRoutePath);
}

describe('tasks route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadRoute();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // POST /projects/:projectId/tasks
  // -------------------------------------------------------------------------
  describe('POST /projects/:projectId/tasks', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const req = { body: {}, params: { projectId: 'proj-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /projects/:projectId/tasks']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('Task title is required');
    });

    it('calls next with 400 when title is whitespace only', async () => {
      // Arrange
      const req = { body: { title: '   ' }, params: { projectId: 'proj-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /projects/:projectId/tasks']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('creates a task and returns 201 for a valid request', async () => {
      // Arrange — two queries: position + insert + fetch with join
      const posRow = { next_pos: 0 };
      const insertedRow = { id: 'task-1', title: 'New task', project_id: 'proj-1' };
      const taskWithUser = { ...insertedRow, assigned_user_name: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [posRow] })       // position query
        .mockResolvedValueOnce({ rows: [insertedRow] })  // insert
        .mockResolvedValueOnce({ rows: [taskWithUser] }); // fetch with join

      const req = { body: { title: 'New task' }, params: { projectId: 'proj-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /projects/:projectId/tasks']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(taskWithUser);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /tasks/:id
  // -------------------------------------------------------------------------
  describe('PUT /tasks/:id', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const req = { body: {}, params: { id: 'task-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PUT /tasks/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('Task title is required');
    });

    it('calls next with 400 when title is empty string', async () => {
      // Arrange
      const req = { body: { title: '' }, params: { id: 'task-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PUT /tasks/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [] }); // update returns no rows

      const req = { body: { title: 'Updated' }, params: { id: 'missing-task' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PUT /tasks/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toContain('Task not found');
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tasks/:id/status
  // -------------------------------------------------------------------------
  describe('PATCH /tasks/:id/status', () => {
    it('calls next with 400 when status is absent', async () => {
      // Arrange
      const req = { body: { position: 1 }, params: { id: 'task-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PATCH /tasks/:id/status']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('Invalid status');
    });

    it('calls next with 400 when status is not in VALID_STATUSES', async () => {
      // Arrange
      const req = { body: { status: 'unknown', position: 0 }, params: { id: 'task-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PATCH /tasks/:id/status']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/Invalid status/);
    });

    it('calls next with 400 when position is missing', async () => {
      // Arrange
      const req = { body: { status: 'done' }, params: { id: 'task-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PATCH /tasks/:id/status']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('Position is required');
    });

    it('accepts position=0 (falsy but valid boundary value)', async () => {
      // Arrange — position 0 is the first slot; must NOT be rejected
      const updatedRow = { id: 'task-1', status: 'in_progress', position: 0 };
      const taskWithUser = { ...updatedRow, assigned_user_name: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [taskWithUser] });

      const req = { body: { status: 'in_progress', position: 0 }, params: { id: 'task-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PATCH /tasks/:id/status']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(taskWithUser);
    });

    it('accepts all valid status values without error', async () => {
      // Arrange
      const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];
      for (const status of validStatuses) {
        vi.clearAllMocks();
        const updatedRow = { id: 'task-1', status, position: 1 };
        mockQuery
          .mockResolvedValueOnce({ rows: [updatedRow] })
          .mockResolvedValueOnce({ rows: [{ ...updatedRow, assigned_user_name: null }] });

        const req = { body: { status, position: 1 }, params: { id: 'task-1' }, headers: {} };
        const res = makeRes();
        const next = vi.fn();

        // Act
        await capturedHandlers['PATCH /tasks/:id/status']?.(req, res, next);

        // Assert
        expect(next).not.toHaveBeenCalled();
      }
    });

    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = { body: { status: 'done', position: 2 }, params: { id: 'missing' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PATCH /tasks/:id/status']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /tasks/:id
  // -------------------------------------------------------------------------
  describe('DELETE /tasks/:id', () => {
    it('calls next with 404 when task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = { body: {}, params: { id: 'missing' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['DELETE /tasks/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toContain('Task not found');
    });

    it('returns success message when task is deleted', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });

      const req = { body: {}, params: { id: 'task-1' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['DELETE /tasks/:id']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 'task-1' });
    });
  });
});
