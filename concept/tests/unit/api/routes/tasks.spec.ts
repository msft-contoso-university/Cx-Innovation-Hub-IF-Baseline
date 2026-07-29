/**
 * Unit tests for tasks routes.
 *
 * Focus: input validation (title, status, position) and 404 handling.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

async function loadTasksRouter() {
  delete require.cache[tasksModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databaseModulePath) {
        return { getPool: mockGetPool };
      }
    } catch {
      // ignore
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksModulePath);
}

type RouteResult =
  | { status: number; body: unknown; err?: undefined }
  | { err: unknown; status?: undefined; body?: undefined };

function callRoute(
  router: any,
  method: string,
  url: string,
  opts: { body?: Record<string, unknown>; headers?: Record<string, string> } = {},
): Promise<RouteResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v: RouteResult) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };

    const res: any = {
      _status: 200,
      status(code: number) { this._status = code; return this; },
      json(body: unknown) { settle({ status: this._status, body }); return this; },
    };

    const next = (err?: unknown) => settle(err ? { err } : { status: 200, body: null });

    router.handle(
      {
        method: method.toUpperCase(),
        url,
        originalUrl: url,
        params: {},
        body: opts.body ?? {},
        headers: opts.headers ?? {},
      },
      res,
      next,
    );
  });
}

describe('tasks routes', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadTasksRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ── GET /projects/:projectId/tasks ──────────────────────────────────────

  describe('GET /projects/:projectId/tasks', () => {
    it('returns 200 with task rows', async () => {
      // Arrange
      const tasks = [{ id: 't1', title: 'First task', status: 'todo' }];
      mockQuery.mockResolvedValueOnce({ rows: tasks });

      // Act
      const result = await callRoute(router, 'GET', '/projects/proj-1/tasks');

      // Assert
      expect(result.status).toBe(200);
      expect(result.body).toEqual(tasks);
    });
  });

  // ── POST /projects/:projectId/tasks ─────────────────────────────────────

  describe('POST /projects/:projectId/tasks', () => {
    it('returns 400 when title is missing', async () => {
      const result = await callRoute(router, 'POST', '/projects/proj-1/tasks', {
        body: { description: 'No title here' },
      });
      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/title/i);
    });

    it('returns 400 when title is whitespace only', async () => {
      const result = await callRoute(router, 'POST', '/projects/proj-1/tasks', {
        body: { title: '   ' },
      });
      expect((result as any).err.status).toBe(400);
    });

    it('returns 201 with created task on success', async () => {
      // Arrange — getNextPos → INSERT → SELECT with user
      const nextPos = [{ next_pos: 0 }];
      const inserted = [{ id: 'new-task', project_id: 'proj-1', title: 'My task', status: 'todo' }];
      const withUser = [{ ...inserted[0], assigned_user_name: null }];
      mockQuery
        .mockResolvedValueOnce({ rows: nextPos })
        .mockResolvedValueOnce({ rows: inserted })
        .mockResolvedValueOnce({ rows: withUser });

      // Act
      const result = await callRoute(router, 'POST', '/projects/proj-1/tasks', {
        body: { title: 'My task' },
      });

      // Assert
      expect(result.status).toBe(201);
      expect((result.body as any).title).toBe('My task');
    });
  });

  // ── PUT /tasks/:id ──────────────────────────────────────────────────────

  describe('PUT /tasks/:id', () => {
    it('returns 400 when title is missing', async () => {
      const result = await callRoute(router, 'PUT', '/tasks/t-1', {
        body: { description: 'Updated description' },
      });
      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/title/i);
    });

    it('returns 404 when the task does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await callRoute(router, 'PUT', '/tasks/t-1', {
        body: { title: 'New title' },
      });

      expect((result as any).err.status).toBe(404);
    });

    it('returns 200 with updated task on success', async () => {
      const updated = [{ id: 't-1', title: 'New title' }];
      const withUser = [{ ...updated[0], assigned_user_name: 'Alice' }];
      mockQuery
        .mockResolvedValueOnce({ rows: updated })
        .mockResolvedValueOnce({ rows: withUser });

      const result = await callRoute(router, 'PUT', '/tasks/t-1', {
        body: { title: 'New title' },
      });

      expect(result.status).toBe(200);
    });
  });

  // ── PATCH /tasks/:id/status ─────────────────────────────────────────────

  describe('PATCH /tasks/:id/status', () => {
    it('returns 400 when status is missing', async () => {
      const result = await callRoute(router, 'PATCH', '/tasks/t-1/status', {
        body: { position: 0 },
      });
      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/status/i);
    });

    it('returns 400 when status value is not in the allowed list', async () => {
      const result = await callRoute(router, 'PATCH', '/tasks/t-1/status', {
        body: { status: 'invalid_status', position: 0 },
      });
      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/todo|in_progress|in_review|done/i);
    });

    it('returns 400 when position is missing', async () => {
      const result = await callRoute(router, 'PATCH', '/tasks/t-1/status', {
        body: { status: 'done' },
      });
      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/position/i);
    });

    it('accepts position 0 (falsy but valid)', async () => {
      // position: 0 is valid — the check is `=== undefined || === null`
      const updated = [{ id: 't-1', status: 'done', position: 0 }];
      const withUser = [{ ...updated[0], assigned_user_name: null }];
      mockQuery
        .mockResolvedValueOnce({ rows: updated })
        .mockResolvedValueOnce({ rows: withUser });

      const result = await callRoute(router, 'PATCH', '/tasks/t-1/status', {
        body: { status: 'done', position: 0 },
      });

      expect(result.status).toBe(200);
    });

    it('returns 404 when the task does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await callRoute(router, 'PATCH', '/tasks/t-1/status', {
        body: { status: 'in_progress', position: 1 },
      });

      expect((result as any).err.status).toBe(404);
    });

    it('accepts all four valid statuses without error', async () => {
      for (const status of ['todo', 'in_progress', 'in_review', 'done']) {
        vi.clearAllMocks();
        const updated = [{ id: 't-1', status }];
        const withUser = [{ ...updated[0], assigned_user_name: null }];
        mockQuery
          .mockResolvedValueOnce({ rows: updated })
          .mockResolvedValueOnce({ rows: withUser });

        const result = await callRoute(router, 'PATCH', '/tasks/t-1/status', {
          body: { status, position: 0 },
        });

        expect(result.status).toBe(200);
      }
    });
  });

  // ── PATCH /tasks/:id/assign ─────────────────────────────────────────────

  describe('PATCH /tasks/:id/assign', () => {
    it('returns 404 when the task does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await callRoute(router, 'PATCH', '/tasks/t-1/assign', {
        body: { assigned_user_id: 'user-1' },
      });

      expect((result as any).err.status).toBe(404);
    });

    it('returns 200 with task on successful assignment', async () => {
      const updated = [{ id: 't-1', assigned_user_id: 'user-1' }];
      const withUser = [{ ...updated[0], assigned_user_name: 'Alice' }];
      mockQuery
        .mockResolvedValueOnce({ rows: updated })
        .mockResolvedValueOnce({ rows: withUser });

      const result = await callRoute(router, 'PATCH', '/tasks/t-1/assign', {
        body: { assigned_user_id: 'user-1' },
      });

      expect(result.status).toBe(200);
      expect((result.body as any).assigned_user_name).toBe('Alice');
    });

    it('accepts null assigned_user_id for unassignment', async () => {
      const updated = [{ id: 't-1', assigned_user_id: null }];
      const withUser = [{ ...updated[0], assigned_user_name: null }];
      mockQuery
        .mockResolvedValueOnce({ rows: updated })
        .mockResolvedValueOnce({ rows: withUser });

      const result = await callRoute(router, 'PATCH', '/tasks/t-1/assign', {
        body: { assigned_user_id: null },
      });

      expect(result.status).toBe(200);
    });
  });

  // ── DELETE /tasks/:id ────────────────────────────────────────────────────

  describe('DELETE /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await callRoute(router, 'DELETE', '/tasks/t-1');

      expect((result as any).err.status).toBe(404);
    });

    it('returns 200 with confirmation when task is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 't-1' }] });

      const result = await callRoute(router, 'DELETE', '/tasks/t-1');

      expect(result.status).toBe(200);
      expect((result.body as any).message).toMatch(/deleted/i);
      expect((result.body as any).id).toBe('t-1');
    });
  });
});
