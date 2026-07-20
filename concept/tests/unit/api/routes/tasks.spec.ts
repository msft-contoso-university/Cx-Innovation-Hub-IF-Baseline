/**
 * Unit tests for concept/apps/api/src/routes/tasks.js
 *
 * Covers:
 *   - PATCH /tasks/:id/status — invalid status value rejected with 400
 *   - PATCH /tasks/:id/status — missing position rejected with 400
 *   - POST  /projects/:projectId/tasks — missing title rejected with 400
 *   - PUT   /tasks/:id — missing title rejected with 400
 *   - PUT   /tasks/:id — 404 when task does not exist
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

// ─── helpers ──────────────────────────────────────────────────────────────────

async function loadTasksRouter(mockGetPool: () => { query: ReturnType<typeof vi.fn> }) {
  delete require.cache[tasksRoutePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    if (request === '../middleware/errorHandler') {
      return originalLoad(
        require.resolve('../../../../apps/api/src/middleware/errorHandler.js'),
        parent,
        isMain,
      );
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksRoutePath);
}

function routerRequest(
  router: { handle: Function },
  method: string,
  url: string,
  opts: { body?: Record<string, unknown>; headers?: Record<string, string> } = {},
): Promise<{ status: number | null; body: unknown; nextErr: unknown }> {
  return new Promise((resolve) => {
    let capturedStatus: number | null = null;
    let capturedBody: unknown = null;

    const req: Record<string, unknown> = {
      method,
      url,
      path: url,
      headers: opts.headers ?? {},
      body: opts.body ?? {},
      params: {},
    };
    const res = {
      status: vi.fn().mockImplementation((s: number) => { capturedStatus = s; return res; }),
      json: vi.fn().mockImplementation((b: unknown) => {
        capturedBody = b;
        resolve({ status: capturedStatus, body: capturedBody, nextErr: null });
      }),
    };
    const next = vi.fn().mockImplementation((err?: unknown) => {
      resolve({ status: capturedStatus, body: capturedBody, nextErr: err });
    });

    router.handle(req, res, next);
  });
}

// ─── PATCH /tasks/:id/status ──────────────────────────────────────────────────

describe('PATCH /tasks/:id/status — status validation', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('calls next with 400 for an unrecognised status value', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadTasksRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'PATCH', '/tasks/1/status', {
      body: { status: 'wip', position: 0 },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/invalid status/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('calls next with 400 for each invalid status boundary value', async () => {
    const invalidStatuses = ['', 'pending', 'DONE', 'in progress', 'review'];

    for (const badStatus of invalidStatuses) {
      const mockQuery = vi.fn();
      const router = await loadTasksRouter(() => ({ query: mockQuery }));

      const result = await routerRequest(router, 'PATCH', '/tasks/1/status', {
        body: { status: badStatus, position: 0 },
      });

      const err = result.nextErr as { status: number; message: string };
      expect(err.status, `expected 400 for status "${badStatus}"`).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    }
  });

  it('calls next with 400 when position is missing', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadTasksRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'PATCH', '/tasks/1/status', {
      body: { status: 'todo' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/position is required/i);
  });

  it('accepts all four valid status values without error', async () => {
    const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];

    for (const validStatus of validStatuses) {
      const mockTask = {
        id: '1', project_id: 'p1', title: 'Task', description: null,
        status: validStatus, position: 0, assigned_user_id: null,
        created_at: new Date(), updated_at: new Date(),
        assigned_user_name: null, assigned_user_avatar_color: null,
      };
      // First query: UPDATE returns the task; second: SELECT with JOIN
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [mockTask] })
        .mockResolvedValueOnce({ rows: [mockTask] });
      const router = await loadTasksRouter(() => ({ query: mockQuery }));

      const result = await routerRequest(router, 'PATCH', '/tasks/1/status', {
        body: { status: validStatus, position: 0 },
      });

      expect(result.nextErr, `unexpected error for status "${validStatus}"`).toBeNull();
      expect(result.body).toBeTruthy();
    }
  });
});

// ─── POST /projects/:projectId/tasks ─────────────────────────────────────────

describe('POST /projects/:projectId/tasks — input validation', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('calls next with 400 when title is absent', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadTasksRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'POST', '/projects/p1/tasks', {
      body: {},
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title is required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('calls next with 400 when title is only whitespace', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadTasksRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'POST', '/projects/p1/tasks', {
      body: { title: '   ' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title is required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ─── PUT /tasks/:id ───────────────────────────────────────────────────────────

describe('PUT /tasks/:id — input validation and 404', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('calls next with 400 when title is absent', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadTasksRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'PUT', '/tasks/1', {
      body: { description: 'Some desc' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title is required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('calls next with 404 when the task does not exist', async () => {
    // Arrange
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    const router = await loadTasksRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'PUT', '/tasks/999', {
      body: { title: 'Updated' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/task not found/i);
  });
});
