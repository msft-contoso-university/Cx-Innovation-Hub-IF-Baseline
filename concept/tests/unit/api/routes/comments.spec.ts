/**
 * Unit tests for the comments route handler.
 *
 * Covers: ownership authorization (PUT/DELETE), input validation,
 * 404 handling, and the happy-path for GET and POST.
 *
 * Uses the Module._load interception pattern (CommonJS mocking) because
 * the route file is CJS and pulls `getPool` via `require`.
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');
// Resolve express from the test package's own node_modules
const expressPath = require.resolve('express');

// --------------------------------------------------------------------------
// Shared mocks
// --------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

async function loadCommentsRouter() {
  delete require.cache[commentsRoutePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return originalLoad(expressPath, parent, isMain);
    }
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    if (request === '../middleware/errorHandler') {
      return originalLoad(errorHandlerPath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsRoutePath);
}

// --------------------------------------------------------------------------
// Helpers — minimal Express-like req/res/next stubs
// --------------------------------------------------------------------------
function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
describe('comments route', () => {
  let router: ReturnType<typeof require>;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadCommentsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -----------------------------------------------------------------------
  // GET /tasks/:taskId/comments
  // -----------------------------------------------------------------------
  describe('GET /tasks/:taskId/comments', () => {
    it('returns comments array on success', async () => {
      // Arrange
      const fakeComments = [
        { id: 1, content: 'Hello', task_id: 5, user_id: 'u1' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: fakeComments });

      const req = makeReq({ params: { taskId: '5' } });
      const res = makeRes();
      const next = vi.fn();

      // Find and call the GET handler directly via router.stack
      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route.methods.get
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.body).toEqual(fakeComments);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next with error on db failure', async () => {
      // Arrange
      const dbError = new Error('DB connection lost');
      mockQuery.mockRejectedValueOnce(dbError);

      const req = makeReq({ params: { taskId: '5' } });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route.methods.get
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // -----------------------------------------------------------------------
  // POST /tasks/:taskId/comments
  // -----------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeReq({
        params: { taskId: '5' },
        body: { content: 'A comment' },
        headers: {},
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route.methods.post
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when content is empty', async () => {
      // Arrange
      const req = makeReq({
        params: { taskId: '5' },
        body: { content: '   ' },
        headers: { 'x-user-id': 'u1' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route.methods.post
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' })
      );
    });

    it('returns 400 when content is missing entirely', async () => {
      // Arrange
      const req = makeReq({
        params: { taskId: '5' },
        body: {},
        headers: { 'x-user-id': 'u1' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route.methods.post
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' })
      );
    });

    it('creates comment and returns 201 on success', async () => {
      // Arrange
      const newRow = { id: 99 };
      const fullComment = { id: 99, content: 'Hello', author_name: 'Alice' };
      mockQuery
        .mockResolvedValueOnce({ rows: [newRow] })     // INSERT
        .mockResolvedValueOnce({ rows: [fullComment] }); // SELECT with JOIN

      const req = makeReq({
        params: { taskId: '5' },
        body: { content: 'Hello' },
        headers: { 'x-user-id': 'u1' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route.methods.post
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(fullComment);
      expect(next).not.toHaveBeenCalled();
    });

    it('trims whitespace from content before inserting', async () => {
      // Arrange
      const newRow = { id: 100 };
      const fullComment = { id: 100, content: 'Trimmed', author_name: 'Bob' };
      mockQuery
        .mockResolvedValueOnce({ rows: [newRow] })
        .mockResolvedValueOnce({ rows: [fullComment] });

      const req = makeReq({
        params: { taskId: '5' },
        body: { content: '  Trimmed  ' },
        headers: { 'x-user-id': 'u2' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route.methods.post
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert — the INSERT query receives trimmed content
      const insertCall = mockQuery.mock.calls[0];
      expect(insertCall[1]).toContain('Trimmed');
    });
  });

  // -----------------------------------------------------------------------
  // PUT /comments/:id  (edit — ownership check)
  // -----------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeReq({
        params: { id: '10' },
        body: { content: 'Updated' },
        headers: {},
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.put
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check: empty

      const req = makeReq({
        params: { id: '999' },
        body: { content: 'Updated' },
        headers: { 'x-user-id': 'u1' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.put
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Comment not found' })
      );
    });

    it('returns 403 when user does not own the comment', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] }); // ownership check

      const req = makeReq({
        params: { id: '10' },
        body: { content: 'Updated' },
        headers: { 'x-user-id': 'attacker' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.put
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only edit your own comments' })
      );
    });

    it('returns 400 when content is empty on edit', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] }); // ownership check passes

      const req = makeReq({
        params: { id: '10' },
        body: { content: '' },
        headers: { 'x-user-id': 'u1' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.put
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' })
      );
    });

    it('updates and returns the comment for the owner', async () => {
      // Arrange
      const updatedRow = { id: 10 };
      const fullComment = { id: 10, content: 'Updated text', author_name: 'Alice' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })  // ownership check
        .mockResolvedValueOnce({ rows: [updatedRow] })           // UPDATE
        .mockResolvedValueOnce({ rows: [fullComment] });          // SELECT with JOIN

      const req = makeReq({
        params: { id: '10' },
        body: { content: 'Updated text' },
        headers: { 'x-user-id': 'u1' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.put
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(res.body).toEqual(fullComment);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /comments/:id  (ownership check)
  // -----------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeReq({
        params: { id: '10' },
        body: {},
        headers: {},
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.delete
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
    });

    it('returns 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = makeReq({
        params: { id: '999' },
        body: {},
        headers: { 'x-user-id': 'u1' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.delete
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Comment not found' })
      );
    });

    it('returns 403 when user does not own the comment', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'real-owner' }] });

      const req = makeReq({
        params: { id: '10' },
        body: {},
        headers: { 'x-user-id': 'intruder' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.delete
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only delete your own comments' })
      );
    });

    it('deletes comment and returns confirmation for the owner', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] });                   // DELETE

      const req = makeReq({
        params: { id: '10' },
        body: {},
        headers: { 'x-user-id': 'u1' },
      });
      const res = makeRes();
      const next = vi.fn();

      const layer = router.stack.find((l: { route: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route.methods.delete
      );

      // Act
      await layer.route.stack[0].handle(req, res, next);

      // Assert
      expect(res.body).toEqual({ message: 'Comment deleted', id: '10' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
