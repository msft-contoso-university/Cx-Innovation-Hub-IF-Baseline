import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  require,
  Module,
  originalLoad,
  makeMockRes,
  routeHandle,
  loadRouterWithMockedDb,
} from './_helpers';

const tasksPath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const dbPath = require.resolve('../../../../apps/api/src/services/database.js');

let mockQuery: ReturnType<typeof vi.fn>;
let router: { handle: Function };

beforeEach(async () => {
  vi.clearAllMocks();
  mockQuery = vi.fn();
  router = await loadRouterWithMockedDb(tasksPath, dbPath, mockQuery);
});

afterEach(() => {
  Module._load = originalLoad;
  delete require.cache[tasksPath];
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/status – status validation
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/status', () => {
  it('returns 400 for an invalid status value', async () => {
    // Arrange
    const req = {
      method: 'PATCH',
      url: '/tasks/task-1/status',
      headers: {},
      body: { status: 'invalid_status', position: 0 },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error & { status: number };
    expect(err.message).toMatch(/Invalid status/);
  });

  it('accepts all four valid statuses without a validation error', async () => {
    // Arrange – mock DB to return the updated task row
    const task = { id: 't1', status: 'in_progress', position: 0 };
    mockQuery.mockResolvedValue({ rows: [task] });

    for (const status of ['todo', 'in_progress', 'in_review', 'done']) {
      const req = {
        method: 'PATCH',
        url: '/tasks/t1/status',
        headers: {},
        body: { status, position: 0 },
        params: {},
        query: {},
      };
      const res = makeMockRes();

      // Act
      const { next } = await routeHandle(router, req, res);
      const nextMock = next as ReturnType<typeof vi.fn>;

      // Assert – next should not be called with an error for valid statuses
      const callWithError = nextMock.mock.calls.find(
        (c) => c[0] instanceof Error,
      );
      expect(callWithError).toBeUndefined();
    }
  });

  it('returns 400 when position is null', async () => {
    // Arrange
    const req = {
      method: 'PATCH',
      url: '/tasks/task-1/status',
      headers: {},
      body: { status: 'todo', position: null },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Position is required' }),
    );
  });

  it('returns 400 when position is missing from body', async () => {
    // Arrange
    const req = {
      method: 'PATCH',
      url: '/tasks/task-1/status',
      headers: {},
      body: { status: 'todo' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Position is required' }),
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /tasks/:id – title validation
// ---------------------------------------------------------------------------
describe('PUT /tasks/:id', () => {
  it('returns 400 when title is missing', async () => {
    // Arrange
    const req = {
      method: 'PUT',
      url: '/tasks/task-1',
      headers: {},
      body: {},
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Task title is required' }),
    );
  });

  it('returns 400 when title is blank whitespace', async () => {
    // Arrange
    const req = {
      method: 'PUT',
      url: '/tasks/task-1',
      headers: {},
      body: { title: '   ' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Task title is required' }),
    );
  });

  it('returns 404 when the task does not exist', async () => {
    // Arrange – first DB call (UPDATE) returns empty, task not found
    mockQuery.mockResolvedValue({ rows: [] });
    const req = {
      method: 'PUT',
      url: '/tasks/no-such-task',
      headers: {},
      body: { title: 'New title' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Task not found' }),
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id – 404 path
// ---------------------------------------------------------------------------
describe('DELETE /tasks/:id', () => {
  it('returns 404 when the task does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValue({ rows: [] });
    const req = {
      method: 'DELETE',
      url: '/tasks/no-such-task',
      headers: {},
      body: {},
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Task not found' }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/tasks – title validation
// ---------------------------------------------------------------------------
describe('POST /projects/:projectId/tasks', () => {
  it('returns 400 when title is missing', async () => {
    // Arrange
    const req = {
      method: 'POST',
      url: '/projects/proj-1/tasks',
      headers: {},
      body: {},
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Task title is required' }),
    );
  });
});
