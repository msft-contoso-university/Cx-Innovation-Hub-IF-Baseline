import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ── helpers ────────────────────────────────────────────────────────────────

type Handler = (req: unknown, res: unknown, next: unknown) => unknown;

type RouteLayer = {
  route: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] };
};

/** Minimal Express Router mock — collects registered routes for test introspection. */
function buildExpressMock() {
  function Router() {
    const stack: RouteLayer[] = [];

    const addRoute = (method: string, path: string, handler: Handler) => {
      stack.push({ route: { path, methods: { [method]: true }, stack: [{ handle: handler }] } });
    };

    return {
      stack,
      get: (path: string, handler: Handler) => addRoute('get', path, handler),
      post: (path: string, handler: Handler) => addRoute('post', path, handler),
      put: (path: string, handler: Handler) => addRoute('put', path, handler),
      patch: (path: string, handler: Handler) => addRoute('patch', path, handler),
      delete: (path: string, handler: Handler) => addRoute('delete', path, handler),
    };
  }

  return { Router };
}

function buildMockPool(queryMock: ReturnType<typeof vi.fn>) {
  return { query: queryMock };
}

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeReq(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return { params, body, headers };
}

async function loadCommentsRouter(queryMock: ReturnType<typeof vi.fn>) {
  delete require.cache[commentsModulePath];
  delete require.cache[databaseModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return buildExpressMock();
    }
    if (request === '../services/database' || request === databaseModulePath) {
      return { getPool: () => buildMockPool(queryMock) };
    }
    if (request === '../middleware/errorHandler' || request === errorHandlerModulePath) {
      return originalLoad(errorHandlerModulePath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

function getHandler(
  router: { stack: RouteLayer[] },
  method: string,
  path: string,
): Handler {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} handler found for ${path}`);
  return layer.route.stack[0].handle;
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('comments routes', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  // ── POST /tasks/:taskId/comments ─────────────────────────────────────────

  describe('POST /tasks/:taskId/comments', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const queryMock = vi.fn();
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      const req = makeReq({ taskId: '1' }, { content: 'Hello' }, {}); // no header
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as { status: number; message: string };
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/X-User-Id/);
    });

    it('calls next with 400 when content is empty', async () => {
      // Arrange
      const queryMock = vi.fn();
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      const req = makeReq({ taskId: '1' }, { content: '' }, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('calls next with 400 when content is only whitespace', async () => {
      // Arrange
      const queryMock = vi.fn();
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      const req = makeReq({ taskId: '1' }, { content: '   ' }, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('creates a comment and returns 201', async () => {
      // Arrange
      const commentRow = { id: 'c-1', content: 'Hello', author_name: 'Alice' };
      const queryMock = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] })  // INSERT
        .mockResolvedValueOnce({ rows: [commentRow] });     // SELECT with join

      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      const req = makeReq(
        { taskId: 'task-1' },
        { content: 'Hello' },
        { 'x-user-id': 'user-1' },
      );
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(commentRow);
    });
  });

  // ── PUT /comments/:id ────────────────────────────────────────────────────

  describe('PUT /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const queryMock = vi.fn();
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = makeReq({ id: 'c-1' }, { content: 'Edited' }, {});
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = makeReq({ id: 'nonexistent' }, { content: 'Edited' }, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(404);
    });

    it('calls next with 403 when user is not the comment author', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-99' }] }); // different author
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = makeReq({ id: 'c-1' }, { content: 'Edited' }, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number; message: string };
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/own/i);
    });

    it('calls next with 400 when content is empty', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = makeReq({ id: 'c-1' }, { content: '' }, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('edits the comment and returns 200 when user is the author', async () => {
      // Arrange
      const commentRow = { id: 'c-1', content: 'Edited', author_name: 'Alice' };
      const queryMock = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] })         // UPDATE
        .mockResolvedValueOnce({ rows: [commentRow] });            // SELECT with join

      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = makeReq({ id: 'c-1' }, { content: 'Edited' }, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(commentRow);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── DELETE /comments/:id ─────────────────────────────────────────────────

  describe('DELETE /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const queryMock = vi.fn();
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = makeReq({ id: 'c-1' }, {}, {});
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(400);
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = makeReq({ id: 'nonexistent' }, {}, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number };
      expect(err.status).toBe(404);
    });

    it('calls next with 403 when user is not the comment author', async () => {
      // Arrange
      const queryMock = vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-99' }] });
      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = makeReq({ id: 'c-1' }, {}, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0] as { status: number; message: string };
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/own/i);
    });

    it('deletes the comment and returns 200 with id when user is the author', async () => {
      // Arrange
      const queryMock = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] });                      // DELETE

      const router = await loadCommentsRouter(queryMock);
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = makeReq({ id: 'c-1' }, {}, { 'x-user-id': 'user-1' });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'c-1' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
