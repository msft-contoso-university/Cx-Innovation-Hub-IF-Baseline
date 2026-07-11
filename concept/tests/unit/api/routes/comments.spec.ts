/**
 * Unit tests for the comments route handlers.
 *
 * Focuses on the security-critical paths:
 *   - Missing X-User-Id header → 400
 *   - Missing / empty content → 400
 *   - Ownership check for PUT and DELETE → 403 when user is not the author
 *
 * Uses the same Module._load interception pattern as database.spec.ts and
 * tasks.spec.ts so no real database or network is required.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function findHandler(router: any, method: string, path: string): Function {
  for (const layer of router.stack) {
    const route = layer.route;
    if (route && route.methods[method.toLowerCase()] && route.path === path) {
      return route.stack[route.stack.length - 1].handle;
    }
  }
  throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
}

// ---------------------------------------------------------------------------
// Module loading with mocked DB
// ---------------------------------------------------------------------------

let mockQueryFn = vi.fn();

async function loadCommentsRouter() {
  delete require.cache[commentsModulePath];
  delete require.cache[databaseModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQueryFn }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('comments route — authorization and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -----------------------------------------------------------------------
  // POST /tasks/:taskId/comments
  // -----------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
      const req = mockReq({ params: { taskId: '1' }, body: { content: 'Hello' }, headers: {} });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
      expect(mockQueryFn).not.toHaveBeenCalled();
    });

    it('calls next with 400 when content is missing', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
      const req = mockReq({
        params: { taskId: '1' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Comment content is required' });
    });

    it('calls next with 400 when content is whitespace only', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
      const req = mockReq({
        params: { taskId: '1' },
        body: { content: '   ' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
    });

    it('creates a comment and returns 201 when input is valid', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
      const newComment = { id: 1, content: 'Hello', task_id: '1' };
      mockQueryFn
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })          // INSERT RETURNING
        .mockResolvedValueOnce({ rows: [newComment] });          // SELECT with JOIN

      const req = mockReq({
        params: { taskId: '1' },
        body: { content: 'Hello' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newComment);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /comments/:id  (author-only edit)
  // -----------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'put', '/comments/:id');
      const req = mockReq({ params: { id: '1' }, body: { content: 'Updated' }, headers: {} });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
      expect(mockQueryFn).not.toHaveBeenCalled();
    });

    it('calls next with 404 when the comment does not exist', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'put', '/comments/:id');
      mockQueryFn.mockResolvedValueOnce({ rows: [] }); // ownership query returns nothing

      const req = mockReq({
        params: { id: '999' },
        body: { content: 'Updated' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Comment not found' });
    });

    it('calls next with 403 when the caller is not the comment author', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'put', '/comments/:id');
      // ownership query returns a DIFFERENT user as author
      mockQueryFn.mockResolvedValueOnce({ rows: [{ user_id: 'owner-user' }] });

      const req = mockReq({
        params: { id: '1' },
        body: { content: 'Malicious edit' },
        headers: { 'x-user-id': 'other-user' },
      });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 403,
        message: 'You can only edit your own comments',
      });
    });

    it('calls next with 400 when content is empty after ownership passes', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'put', '/comments/:id');
      mockQueryFn.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }); // ownership OK

      const req = mockReq({
        params: { id: '1' },
        body: { content: '' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Comment content is required' });
    });

    it('updates the comment and returns 200 when caller is the author', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'put', '/comments/:id');
      const updatedComment = { id: 1, content: 'Updated text' };
      mockQueryFn
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })              // UPDATE RETURNING
        .mockResolvedValueOnce({ rows: [updatedComment] });         // SELECT with JOIN

      const req = mockReq({
        params: { id: '1' },
        body: { content: 'Updated text' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(updatedComment);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /comments/:id  (author-only delete)
  // -----------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'delete', '/comments/:id');
      const req = mockReq({ params: { id: '1' }, headers: {} });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
      expect(mockQueryFn).not.toHaveBeenCalled();
    });

    it('calls next with 404 when the comment does not exist', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'delete', '/comments/:id');
      mockQueryFn.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ params: { id: '999' }, headers: { 'x-user-id': 'user-1' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Comment not found' });
    });

    it('calls next with 403 when the caller is not the comment author', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'delete', '/comments/:id');
      mockQueryFn.mockResolvedValueOnce({ rows: [{ user_id: 'owner-user' }] });

      const req = mockReq({ params: { id: '1' }, headers: { 'x-user-id': 'intruder' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 403,
        message: 'You can only delete your own comments',
      });
    });

    it('deletes the comment and returns confirmation when caller is the author', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'delete', '/comments/:id');
      mockQueryFn
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] });                       // DELETE

      const req = mockReq({ params: { id: '1' }, headers: { 'x-user-id': 'user-1' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: '1' });
    });
  });

  // -----------------------------------------------------------------------
  // GET /tasks/:taskId/comments
  // -----------------------------------------------------------------------
  describe('GET /tasks/:taskId/comments', () => {
    it('returns comment list from the database', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = findHandler(router, 'get', '/tasks/:taskId/comments');
      const comments = [{ id: 1, content: 'First comment' }];
      mockQueryFn.mockResolvedValueOnce({ rows: comments });

      const req = mockReq({ params: { taskId: '42' } });
      const res = mockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(comments);
    });
  });
});
