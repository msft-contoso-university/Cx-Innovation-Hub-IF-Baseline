/**
 * Unit tests for the tasks route handlers.
 *
 * Focuses on input-validation and boundary conditions that carry real risk:
 *   - Task title required for creation
 *   - Status enum validation for the Kanban drag-drop endpoint
 *   - Position required for the status-change endpoint
 *   - 404 handling for task not found
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const dir = dirname(fileURLToPath(import.meta.url));
const tasksRouterPath = resolve(dir, '../../../../apps/api/src/routes/tasks.js');

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

let handlers: Record<string, Function> = {};

function createMockRouter() {
  const router: any = {};
  handlers = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    router[method] = (path: string, handler: Function) => {
      handlers[`${method.toUpperCase()} ${path}`] = handler;
      return router;
    };
  }
  return router;
}

function loadRouter() {
  delete require.cache[tasksRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return { Router: createMockRouter };
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  require(tasksRouterPath);
}

beforeEach(() => {
  vi.clearAllMocks();
  loadRouter();
});

afterEach(() => {
  Module._load = originalLoad;
});

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/tasks
// ---------------------------------------------------------------------------
describe('POST /api/projects/:projectId/tasks', () => {
  it('calls next with 400 when title is missing', async () => {
    // Arrange
    const req = { body: {}, params: { projectId: 'p-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /projects/:projectId/tasks']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Task title is required' });
  });

  it('calls next with 400 when title is whitespace-only', async () => {
    // Arrange
    const req = { body: { title: '   ' }, params: { projectId: 'p-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /projects/:projectId/tasks']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
  });

  it('responds 201 with the created task when title is valid', async () => {
    // Arrange
    const posRow = { next_pos: 0 };
    const insertedTask = { id: 't-1', project_id: 'p-1', title: 'Do it', status: 'todo' };
    const taskWithUser = { ...insertedTask, assigned_user_name: null, assigned_user_avatar_color: null };

    mockQuery
      .mockResolvedValueOnce({ rows: [posRow] })      // position SELECT
      .mockResolvedValueOnce({ rows: [insertedTask] }) // INSERT
      .mockResolvedValueOnce({ rows: [taskWithUser] }); // JOIN SELECT

    const req = { body: { title: 'Do it' }, params: { projectId: 'p-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /projects/:projectId/tasks']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(taskWithUser);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id/status  (Kanban drag-drop)
// ---------------------------------------------------------------------------
describe('PATCH /api/tasks/:id/status', () => {
  it('calls next with 400 when status is not a valid value', async () => {
    // Arrange
    const req = { body: { status: 'flying', position: 0 }, params: { id: 't-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
    expect(next.mock.calls[0][0].message).toMatch(/Invalid status/);
  });

  it('calls next with 400 when status is missing', async () => {
    // Arrange
    const req = { body: { position: 0 }, params: { id: 't-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
  });

  it('calls next with 400 when position is undefined', async () => {
    // Arrange
    const req = { body: { status: 'todo' }, params: { id: 't-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Position is required' });
  });

  it('calls next with 400 when position is null', async () => {
    // Arrange
    const req = { body: { status: 'in_progress', position: null }, params: { id: 't-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Position is required' });
  });

  it('accepts position 0 as a valid value', async () => {
    // Arrange – position 0 is falsy but must be accepted
    const updatedTask = { id: 't-1', status: 'todo', position: 0 };
    const taskWithUser = { ...updatedTask, assigned_user_name: null };
    mockQuery
      .mockResolvedValueOnce({ rows: [updatedTask] })   // UPDATE
      .mockResolvedValueOnce({ rows: [taskWithUser] }); // JOIN SELECT

    const req = { body: { status: 'todo', position: 0 }, params: { id: 't-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(taskWithUser);
  });

  it('calls next with 404 when the task does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { body: { status: 'done', position: 1 }, params: { id: 'missing' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PATCH /tasks/:id/status']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
  });

  it('accepts all four valid statuses', async () => {
    // Arrange
    const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];
    for (const status of validStatuses) {
      vi.clearAllMocks();
      loadRouter();
      const task = { id: 't-1', status };
      mockQuery
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [task] });

      const req = { body: { status, position: 0 }, params: { id: 't-1' }, headers: {} };
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
      const next = vi.fn();

      // Act
      await handlers['PATCH /tasks/:id/status']!(req, res, next);

      // Assert – no validation error for any valid status
      expect(next).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/tasks/:id
// ---------------------------------------------------------------------------
describe('PUT /api/tasks/:id', () => {
  it('calls next with 400 when title is missing', async () => {
    // Arrange
    const req = { body: {}, params: { id: 't-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PUT /tasks/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Task title is required' });
  });

  it('calls next with 404 when the task is not found', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { body: { title: 'Updated title' }, params: { id: 'missing' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PUT /tasks/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/tasks/:id', () => {
  it('calls next with 404 when the task does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { body: {}, params: { id: 'missing' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['DELETE /tasks/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Task not found' });
  });

  it('responds with a success message when the task is deleted', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't-1' }] });
    const req = { body: {}, params: { id: 't-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['DELETE /tasks/:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 't-1' });
  });
});
