import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Lightweight Express Router mock
// ---------------------------------------------------------------------------

function createMockRouter() {
  const stack: any[] = [];
  const router: any = { stack };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (routePath: string, handler: Function) => {
      stack.push({
        route: {
          path: routePath,
          methods: { [method]: true },
          stack: [{ handle: handler }],
        },
      });
    };
  }
  return router;
}

const expressMock = { Router: createMockRouter };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHandler(router: any, method: string, routePath: string): Function {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.path === routePath &&
      l.route.methods[method.toLowerCase()],
  );
  if (!layer) throw new Error(`No ${method} ${routePath} route found`);
  return layer.route.stack[0].handle;
}

function buildRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json }, status, json };
}

// Real createError — no external deps.
const { createError } = require(errorHandlerModulePath);

async function loadRouter(mockGetPool: () => any) {
  delete require.cache[commentsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return expressMock;

    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databaseModulePath) {
        return { getPool: mockGetPool };
      }
      if (resolved === errorHandlerModulePath) {
        return { createError };
      }
    } catch {
      // ignore resolution errors
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('comments routes', () => {
  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[commentsModulePath];
  });

  // ── POST /api/tasks/:taskId/comments ─────────────────────────────────────
  describe('POST /tasks/:taskId/comments', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const router = await loadRouter(() => ({ query: vi.fn() }));
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');

      const req = { params: { taskId: '1' }, body: { content: 'Hello' }, headers: {} };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/x-user-id header is required/i);
    });

    it('returns 400 when content is empty', async () => {
      // Arrange
      const router = await loadRouter(() => ({ query: vi.fn() }));
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');

      const req = {
        params: { taskId: '1' },
        body: { content: '   ' },
        headers: { 'x-user-id': 'user-1' },
      };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/comment content is required/i);
    });

    it('creates a comment and responds with 201', async () => {
      // Arrange
      const inserted = { id: 10, task_id: '1', user_id: 'user-1', content: 'LGTM' };
      const commentWithAuthor = { ...inserted, author_name: 'Alice' };
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [inserted] })
        .mockResolvedValueOnce({ rows: [commentWithAuthor] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');

      const req = {
        params: { taskId: '1' },
        body: { content: 'LGTM' },
        headers: { 'x-user-id': 'user-1' },
      };
      const { res, status, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(status).toHaveBeenCalledWith(201);
      expect(json).toHaveBeenCalledWith(commentWithAuthor);
    });

    it('trims content and stores null for missing parent_comment_id', async () => {
      // Arrange
      const inserted = { id: 11, content: 'Hello' };
      const commentWithAuthor = { ...inserted, author_name: 'Bob' };
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [inserted] })
        .mockResolvedValueOnce({ rows: [commentWithAuthor] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');

      const req = {
        params: { taskId: '2' },
        body: { content: '  Hello  ' },
        headers: { 'x-user-id': 'user-2' },
      };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO comments'),
        ['2', 'user-2', null, 'Hello'],
      );
    });
  });

  // ── PUT /api/comments/:id ─────────────────────────────────────────────────
  describe('PUT /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const router = await loadRouter(() => ({ query: vi.fn() }));
      const handler = getHandler(router, 'put', '/comments/:id');

      const req = { params: { id: '5' }, body: { content: 'Updated' }, headers: {} };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/x-user-id header is required/i);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'put', '/comments/:id');

      const req = {
        params: { id: '999' },
        body: { content: 'Updated' },
        headers: { 'x-user-id': 'user-1' },
      };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/comment not found/i);
    });

    it('returns 403 when the requester is not the comment author', async () => {
      // Arrange — comment owned by user-99
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-99' }] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'put', '/comments/:id');

      const req = {
        params: { id: '5' },
        body: { content: 'Hijacked edit' },
        headers: { 'x-user-id': 'user-1' },   // different user
      };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/only edit your own comments/i);
    });

    it('returns 400 when updated content is empty', async () => {
      // Arrange — comment owned by user-1
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'put', '/comments/:id');

      const req = {
        params: { id: '5' },
        body: { content: '  ' },
        headers: { 'x-user-id': 'user-1' },
      };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/comment content is required/i);
    });

    it('updates the comment when requester is the author', async () => {
      // Arrange
      const updated = { id: 5, content: 'Fixed text', user_id: 'user-1' };
      const commentWithAuthor = { ...updated, author_name: 'Alice' };
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [commentWithAuthor] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'put', '/comments/:id');

      const req = {
        params: { id: '5' },
        body: { content: 'Fixed text' },
        headers: { 'x-user-id': 'user-1' },
      };
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(commentWithAuthor);
    });
  });

  // ── DELETE /api/comments/:id ──────────────────────────────────────────────
  describe('DELETE /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const router = await loadRouter(() => ({ query: vi.fn() }));
      const handler = getHandler(router, 'delete', '/comments/:id');

      const req = { params: { id: '5' }, headers: {} };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'delete', '/comments/:id');

      const req = { params: { id: '999' }, headers: { 'x-user-id': 'user-1' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
    });

    it('returns 403 when the requester is not the comment author', async () => {
      // Arrange — comment owned by user-99
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-99' }] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'delete', '/comments/:id');

      const req = {
        params: { id: '5' },
        headers: { 'x-user-id': 'user-1' },   // different user
      };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/only delete your own comments/i);
    });

    it('deletes the comment and returns confirmation when requester is author', async () => {
      // Arrange
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'delete', '/comments/:id');

      const req = { params: { id: '5' }, headers: { 'x-user-id': 'user-1' } };
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ message: 'Comment deleted', id: '5' });
    });
  });

  // ── GET /api/tasks/:taskId/comments ───────────────────────────────────────
  describe('GET /tasks/:taskId/comments', () => {
    it('returns comments for the task ordered by creation time', async () => {
      // Arrange
      const comments = [
        { id: 1, content: 'First', author_name: 'Alice' },
        { id: 2, content: 'Second', author_name: 'Bob' },
      ];
      const mockQuery = vi.fn().mockResolvedValue({ rows: comments });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'get', '/tasks/:taskId/comments');

      const req = { params: { taskId: '1' } };
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(json).toHaveBeenCalledWith(comments);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
