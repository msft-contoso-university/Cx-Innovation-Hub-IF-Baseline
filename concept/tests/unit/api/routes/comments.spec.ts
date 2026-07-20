import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------
let mockQuery: ReturnType<typeof vi.fn>;
let capturedHandlers: Record<string, (...args: unknown[]) => Promise<void>>;

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn();
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  };
}

async function loadRoute() {
  capturedHandlers = {};
  delete require.cache[commentsRoutePath];

  const mockRouter: Record<string, unknown> = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    mockRouter[method] = vi.fn((path: string, handler: (...args: unknown[]) => Promise<void>) => {
      capturedHandlers[`${method.toUpperCase()} ${path}`] = handler;
    });
  }

  mockQuery = vi.fn();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  require(commentsRoutePath);
}

describe('comments route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadRoute();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // POST /tasks/:taskId/comments
  // -------------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeReq({ params: { taskId: 'task-1' }, body: { content: 'Hello' } });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /tasks/:taskId/comments']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('X-User-Id header is required');
    });

    it('calls next with 400 when content is missing', async () => {
      // Arrange
      const req = makeReq({
        params: { taskId: 'task-1' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /tasks/:taskId/comments']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('Comment content is required');
    });

    it('calls next with 400 when content is whitespace only', async () => {
      // Arrange
      const req = makeReq({
        params: { taskId: 'task-1' },
        body: { content: '   ' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /tasks/:taskId/comments']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('creates a comment and returns 201 for a valid request', async () => {
      // Arrange
      const insertedRow = { id: 'cmt-1', task_id: 'task-1', user_id: 'user-1', content: 'Hello' };
      const commentWithAuthor = { ...insertedRow, author_name: 'Alice', author_avatar_color: '#abc' };
      mockQuery
        .mockResolvedValueOnce({ rows: [insertedRow] })
        .mockResolvedValueOnce({ rows: [commentWithAuthor] });

      const req = makeReq({
        params: { taskId: 'task-1' },
        body: { content: 'Hello' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /tasks/:taskId/comments']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(commentWithAuthor);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /comments/:id  (edit — author only)
  // -------------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeReq({ params: { id: 'cmt-1' }, body: { content: 'Updated' } });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PUT /comments/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('X-User-Id header is required');
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check returns nothing

      const req = makeReq({
        params: { id: 'missing-cmt' },
        body: { content: 'Updated' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PUT /comments/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toContain('Comment not found');
    });

    it('calls next with 403 when the requester is not the comment author', async () => {
      // Arrange — comment belongs to user-2, requester is user-1
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

      const req = makeReq({
        params: { id: 'cmt-1' },
        body: { content: 'Sneaky edit' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PUT /comments/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toContain('edit your own comments');
    });

    it('calls next with 400 when content is missing (authorized user)', async () => {
      // Arrange — comment belongs to user-1, requester is user-1, but no content
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

      const req = makeReq({
        params: { id: 'cmt-1' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PUT /comments/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('Comment content is required');
    });

    it('edits the comment and returns the updated record when authorized', async () => {
      // Arrange
      const existingRow = { user_id: 'user-1' };
      const updatedRow = { id: 'cmt-1', content: 'Updated content' };
      const commentWithAuthor = { ...updatedRow, author_name: 'Alice' };
      mockQuery
        .mockResolvedValueOnce({ rows: [existingRow] }) // ownership check
        .mockResolvedValueOnce({ rows: [updatedRow] })  // update
        .mockResolvedValueOnce({ rows: [commentWithAuthor] }); // fetch with join

      const req = makeReq({
        params: { id: 'cmt-1' },
        body: { content: 'Updated content' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['PUT /comments/:id']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(commentWithAuthor);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /comments/:id  (delete — author only)
  // -------------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeReq({ params: { id: 'cmt-1' } });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['DELETE /comments/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('X-User-Id header is required');
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = makeReq({
        params: { id: 'missing-cmt' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['DELETE /comments/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
    });

    it('calls next with 403 when the requester is not the comment author', async () => {
      // Arrange — comment belongs to user-2, requester is user-1
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

      const req = makeReq({
        params: { id: 'cmt-1' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['DELETE /comments/:id']?.(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toContain('delete your own comments');
    });

    it('deletes the comment and returns confirmation when authorized', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] });                       // delete

      const req = makeReq({
        params: { id: 'cmt-1' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['DELETE /comments/:id']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'cmt-1' });
    });
  });
});
