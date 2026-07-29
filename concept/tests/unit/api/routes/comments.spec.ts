/**
 * Unit tests for comments routes.
 *
 * High-value focus: authorization ownership checks for PUT and DELETE.
 * A user should only be able to edit or delete comments they authored;
 * any other caller must receive 403.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

async function loadCommentsRouter() {
  delete require.cache[commentsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databaseModulePath) {
        return { getPool: mockGetPool };
      }
    } catch {
      // ignore resolution errors and fall through
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

// ---------------------------------------------------------------------------
// Helper: drive the Express Router with a mock req/res/next
// ---------------------------------------------------------------------------
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
      status(code: number) {
        this._status = code;
        return this;
      },
      json(body: unknown) {
        settle({ status: this._status, body });
        return this;
      },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('comments routes', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadCommentsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ── GET /tasks/:taskId/comments ─────────────────────────────────────────

  describe('GET /tasks/:taskId/comments', () => {
    it('returns 200 with comment rows on success', async () => {
      // Arrange
      const comments = [{ id: 'c1', content: 'Hello', author_name: 'Alice' }];
      mockQuery.mockResolvedValueOnce({ rows: comments });

      // Act
      const result = await callRoute(router, 'GET', '/tasks/task-1/comments');

      // Assert
      expect(result.status).toBe(200);
      expect(result.body).toEqual(comments);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('calls next with error when the database throws', async () => {
      // Arrange
      const dbError = new Error('DB failure');
      mockQuery.mockRejectedValueOnce(dbError);

      // Act
      const result = await callRoute(router, 'GET', '/tasks/task-1/comments');

      // Assert
      expect((result as any).err).toBe(dbError);
    });
  });

  // ── POST /tasks/:taskId/comments ────────────────────────────────────────

  describe('POST /tasks/:taskId/comments', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange / Act
      const result = await callRoute(router, 'POST', '/tasks/task-1/comments', {
        body: { content: 'A comment' },
        headers: {}, // no X-User-Id
      });

      // Assert
      expect((result as any).err).toBeDefined();
      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/X-User-Id/);
    });

    it('returns 400 when content is empty', async () => {
      // Arrange / Act
      const result = await callRoute(router, 'POST', '/tasks/task-1/comments', {
        body: { content: '' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Assert
      expect((result as any).err).toBeDefined();
      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/content/i);
    });

    it('returns 400 when content is whitespace only', async () => {
      const result = await callRoute(router, 'POST', '/tasks/task-1/comments', {
        body: { content: '   ' },
        headers: { 'x-user-id': 'user-1' },
      });
      expect((result as any).err.status).toBe(400);
    });

    it('returns 201 with comment on success', async () => {
      // Arrange
      const inserted = [{ id: 'new-c', task_id: 'task-1', content: 'Hello' }];
      const withAuthor = [{ ...inserted[0], author_name: 'Alice', author_avatar_color: '#f00' }];
      mockQuery
        .mockResolvedValueOnce({ rows: inserted })   // INSERT
        .mockResolvedValueOnce({ rows: withAuthor }); // SELECT with author

      // Act
      const result = await callRoute(router, 'POST', '/tasks/task-1/comments', {
        body: { content: 'Hello' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Assert
      expect(result.status).toBe(201);
      expect((result.body as any).author_name).toBe('Alice');
    });
  });

  // ── PUT /comments/:id ───────────────────────────────────────────────────

  describe('PUT /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      const result = await callRoute(router, 'PUT', '/comments/c-1', {
        body: { content: 'Updated' },
        headers: {},
      });
      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/X-User-Id/);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange — ownership check returns no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      const result = await callRoute(router, 'PUT', '/comments/c-1', {
        body: { content: 'Updated' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Assert
      expect((result as any).err.status).toBe(404);
      expect((result as any).err.message).toMatch(/not found/i);
    });

    it('returns 403 when the caller is not the comment author', async () => {
      // Arrange — comment belongs to user-2, caller is user-1
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

      // Act
      const result = await callRoute(router, 'PUT', '/comments/c-1', {
        body: { content: 'Hijacked' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Assert
      expect((result as any).err.status).toBe(403);
      expect((result as any).err.message).toMatch(/own/i);
    });

    it('returns 400 when content is empty after trimming', async () => {
      // Arrange — ownership check passes
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

      // Act
      const result = await callRoute(router, 'PUT', '/comments/c-1', {
        body: { content: '   ' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Assert
      expect((result as any).err.status).toBe(400);
    });

    it('returns 200 with updated comment when owner edits', async () => {
      // Arrange
      const updated = [{ id: 'c-1', content: 'Updated text' }];
      const withAuthor = [{ ...updated[0], author_name: 'Alice' }];
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership
        .mockResolvedValueOnce({ rows: updated })                  // UPDATE
        .mockResolvedValueOnce({ rows: withAuthor });              // SELECT with author

      // Act
      const result = await callRoute(router, 'PUT', '/comments/c-1', {
        body: { content: 'Updated text' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Assert
      expect(result.status).toBe(200);
      expect((result.body as any).author_name).toBe('Alice');
    });
  });

  // ── DELETE /comments/:id ─────────────────────────────────────────────────

  describe('DELETE /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      const result = await callRoute(router, 'DELETE', '/comments/c-1', {
        headers: {},
      });
      expect((result as any).err.status).toBe(400);
    });

    it('returns 404 when the comment does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await callRoute(router, 'DELETE', '/comments/c-1', {
        headers: { 'x-user-id': 'user-1' },
      });

      expect((result as any).err.status).toBe(404);
    });

    it('returns 403 when the caller is not the comment author', async () => {
      // Arrange — comment belongs to user-2
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

      // Act
      const result = await callRoute(router, 'DELETE', '/comments/c-1', {
        headers: { 'x-user-id': 'user-1' },
      });

      // Assert
      expect((result as any).err.status).toBe(403);
      expect((result as any).err.message).toMatch(/own/i);
    });

    it('returns 200 with confirmation when owner deletes', async () => {
      // Arrange — ownership check passes, delete succeeds
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership
        .mockResolvedValueOnce({ rows: [] });                      // DELETE

      // Act
      const result = await callRoute(router, 'DELETE', '/comments/c-1', {
        headers: { 'x-user-id': 'user-1' },
      });

      // Assert
      expect(result.status).toBe(200);
      expect((result.body as any).message).toMatch(/deleted/i);
    });
  });
});
