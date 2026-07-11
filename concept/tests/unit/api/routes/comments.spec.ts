import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// Pre-load express from test's node_modules before patching Module._load
const expressModule = require('express');

const commentsRouterPath = require.resolve('../../../../apps/api/src/routes/comments.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json };
}

function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  if (!layer) throw new Error(`No handler found for ${method} ${path}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle as Function;
}

async function loadCommentsRouter(mockPool: { query: ReturnType<typeof vi.fn> }) {
  delete require.cache[commentsRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: () => mockPool };
    }
    // Redirect bare 'express' to the copy installed in the test package
    if (request === 'express') {
      return expressModule;
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsRouterPath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('comments routes — authorization and validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[commentsRouterPath];
  });

  // -------------------------------------------------------------------------
  // POST /tasks/:taskId/comments
  // -------------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const mockPool = { query: vi.fn() };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

      const req: any = { params: { taskId: '1' }, body: { content: 'hello' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/x-user-id/i);
    });

    it('calls next with 400 when content is missing', async () => {
      // Arrange
      const mockPool = { query: vi.fn() };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

      const req: any = {
        params: { taskId: '1' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/content/i);
    });

    it('calls next with 400 when content is whitespace only', async () => {
      // Arrange
      const mockPool = { query: vi.fn() };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

      const req: any = {
        params: { taskId: '1' },
        body: { content: '   ' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /comments/:id  (edit — author only)
  // -------------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const mockPool = { query: vi.fn() };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'put', '/comments/:id');

      const req: any = { params: { id: '10' }, body: { content: 'edited' }, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/x-user-id/i);
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'put', '/comments/:id');

      const req: any = {
        params: { id: '999' },
        body: { content: 'edited' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/comment not found/i);
    });

    it('calls next with 403 when user does not own the comment', async () => {
      // Arrange — comment belongs to 'user-2', request comes from 'user-1'
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-2' }] }),
      };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'put', '/comments/:id');

      const req: any = {
        params: { id: '10' },
        body: { content: 'edited' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/edit your own/i);
    });

    it('calls next with 400 when content is missing after ownership check passes', async () => {
      // Arrange — comment belongs to the same user making the request
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-1' }] }),
      };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'put', '/comments/:id');

      const req: any = {
        params: { id: '10' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/content/i);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /comments/:id  (delete — author only)
  // -------------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const mockPool = { query: vi.fn() };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'delete', '/comments/:id');

      const req: any = { params: { id: '10' }, body: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/x-user-id/i);
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'delete', '/comments/:id');

      const req: any = {
        params: { id: '999' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/comment not found/i);
    });

    it('calls next with 403 when user does not own the comment', async () => {
      // Arrange — comment owned by 'user-2', requester is 'user-1'
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-2' }] }),
      };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'delete', '/comments/:id');

      const req: any = {
        params: { id: '10' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/delete your own/i);
    });

    it('returns deleted confirmation when user owns the comment', async () => {
      // Arrange — ownership check returns matching user, delete succeeds
      const mockPool = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })  // ownership SELECT
          .mockResolvedValueOnce({ rows: [] }),                        // DELETE
      };
      const router = await loadCommentsRouter(mockPool);
      const handler = findHandler(router, 'delete', '/comments/:id');

      const req: any = {
        params: { id: '10' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      };
      const jsonSpy = vi.fn();
      const res = { json: jsonSpy, status: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ status: expect.any(Number) }));
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'Comment deleted' }));
    });
  });
});
