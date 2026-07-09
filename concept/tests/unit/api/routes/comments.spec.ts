/**
 * Unit tests for /api/comments route handlers.
 *
 * Focuses on the highest-risk logic in the application:
 *  - X-User-Id header requirement (auth gate)
 *  - Ownership enforcement (403 when caller ≠ author)
 *  - Input validation (empty content)
 *  - 404 when a comment does not exist
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// Resolve absolute paths so the cache-injection works regardless of CWD.
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');
const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');

// ─── Minimal Express mock ────────────────────────────────────────────────────
// We capture route registrations without needing the real Express package.

interface RouteEntry {
  method: string;
  path: string;
  handler: (req: unknown, res: unknown, next: (err?: unknown) => void) => Promise<void>;
}

class MockRouter {
  stack: RouteEntry[] = [];
  private _add(method: string, path: string, handler: RouteEntry['handler']) {
    this.stack.push({ method, path, handler });
  }
  get(path: string, h: RouteEntry['handler']) { this._add('GET', path, h); }
  post(path: string, h: RouteEntry['handler']) { this._add('POST', path, h); }
  put(path: string, h: RouteEntry['handler']) { this._add('PUT', path, h); }
  patch(path: string, h: RouteEntry['handler']) { this._add('PATCH', path, h); }
  delete(path: string, h: RouteEntry['handler']) { this._add('DELETE', path, h); }
}

// ─── Shared mocks ────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
const mockGetPool = vi.fn().mockReturnValue(mockPool);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReqRes(overrides: {
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}) {
  const req = {
    headers: overrides.headers ?? {},
    body: overrides.body ?? {},
    params: overrides.params ?? {},
  };
  const mockJson = vi.fn();
  const mockStatus = vi.fn().mockReturnValue({ json: mockJson });
  const res = { json: mockJson, status: mockStatus };
  const next = vi.fn();
  return { req, res, next };
}

function findHandler(router: MockRouter, method: string, path: string) {
  const entry = router.stack.find(r => r.method === method && r.path === path);
  if (!entry) throw new Error(`No handler for ${method} ${path}`);
  return entry.handler;
}

async function loadCommentsRouter(): Promise<MockRouter> {
  delete require.cache[commentsRoutePath];

  const mockRouter = new MockRouter();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    return originalLoad(request, parent, isMain);
  };

  // Inject mocked database and real errorHandler into require cache.
  require.cache[databaseModulePath] = {
    id: databaseModulePath,
    filename: databaseModulePath,
    loaded: true,
    exports: { getPool: mockGetPool },
    children: [],
    paths: [],
  };

  require(commentsRoutePath);
  return mockRouter;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('comments routes', () => {
  let router: MockRouter;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadCommentsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[commentsRoutePath];
    delete require.cache[databaseModulePath];
  });

  // ── POST /tasks/:taskId/comments ─────────────────────────────────────────

  describe('POST /tasks/:taskId/comments', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        headers: {},
        body: { content: 'Hello' },
        params: { taskId: '1' },
      });
      const handler = findHandler(router, 'POST', '/tasks/:taskId/comments');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/X-User-Id/i);
    });

    it('calls next with 400 when content is empty', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        headers: { 'x-user-id': 'user-1' },
        body: { content: '   ' },
        params: { taskId: '1' },
      });
      const handler = findHandler(router, 'POST', '/tasks/:taskId/comments');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/content/i);
    });

    it('calls next with 400 when content is absent', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        headers: { 'x-user-id': 'user-1' },
        body: {},
        params: { taskId: '1' },
      });
      const handler = findHandler(router, 'POST', '/tasks/:taskId/comments');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });
  });

  // ── PUT /comments/:id ────────────────────────────────────────────────────

  describe('PUT /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        headers: {},
        body: { content: 'Updated content' },
        params: { id: '42' },
      });
      const handler = findHandler(router, 'PUT', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/X-User-Id/i);
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership lookup → not found
      const { req, res, next } = makeReqRes({
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'Updated content' },
        params: { id: '999' },
      });
      const handler = findHandler(router, 'PUT', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
    });

    it('calls next with 403 when caller is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] });
      const { req, res, next } = makeReqRes({
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'Updated' },
        params: { id: '42' },
      });
      const handler = findHandler(router, 'PUT', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/own/i);
    });

    it('calls next with 400 when content is empty after ownership check passes', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
      const { req, res, next } = makeReqRes({
        headers: { 'x-user-id': 'user-1' },
        body: { content: '   ' },
        params: { id: '42' },
      });
      const handler = findHandler(router, 'PUT', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/content/i);
    });
  });

  // ── DELETE /comments/:id ─────────────────────────────────────────────────

  describe('DELETE /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        headers: {},
        params: { id: '42' },
      });
      const handler = findHandler(router, 'DELETE', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/X-User-Id/i);
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeReqRes({
        headers: { 'x-user-id': 'user-1' },
        params: { id: '999' },
      });
      const handler = findHandler(router, 'DELETE', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
    });

    it('calls next with 403 when caller is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] });
      const { req, res, next } = makeReqRes({
        headers: { 'x-user-id': 'user-1' },
        params: { id: '42' },
      });
      const handler = findHandler(router, 'DELETE', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/own/i);
    });
  });
});
