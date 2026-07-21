import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// ---------------------------------------------------------------------------
// Pure re-implementation of createError so the route module gets a real one
// even though we intercept its require call.
// ---------------------------------------------------------------------------
function createError(status: number, message: string) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ---------------------------------------------------------------------------
// Route handler registry — populated when the comments module is loaded.
// Keys follow the pattern "METHOD /path".
// ---------------------------------------------------------------------------
type Handler = (req: Record<string, unknown>, res: Record<string, unknown>, next: (err?: unknown) => void) => void | Promise<void>;
const routeHandlers: Record<string, Handler> = {};
let mockQuery: ReturnType<typeof vi.fn>;

const mockRouter = {
  get: (path: string, handler: Handler) => { routeHandlers[`GET ${path}`] = handler; },
  post: (path: string, handler: Handler) => { routeHandlers[`POST ${path}`] = handler; },
  put: (path: string, handler: Handler) => { routeHandlers[`PUT ${path}`] = handler; },
  patch: (path: string, handler: Handler) => { routeHandlers[`PATCH ${path}`] = handler; },
  delete: (path: string, handler: Handler) => { routeHandlers[`DELETE ${path}`] = handler; },
};

const commentsModulePath = require.resolve(
  '../../../../apps/api/src/routes/comments.js',
);

function loadCommentsModule() {
  delete require.cache[commentsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    if (request === '../middleware/errorHandler') {
      return { createError };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

// ---------------------------------------------------------------------------
// Helpers to build lightweight mock req / res / next objects
// ---------------------------------------------------------------------------
function makeMockRes() {
  const res = {
    statusCode: 200,
    _json: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this._json = body; return this; },
  };
  return res;
}

function makeMockReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    params: {},
    body: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('comments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
    loadCommentsModule();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // POST /tasks/:taskId/comments
  // -------------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeMockReq({ params: { taskId: '1' }, body: { content: 'hello' } });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['POST /tasks/:taskId/comments'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/X-User-Id/i);
    });

    it('returns 400 when comment content is empty', async () => {
      // Arrange
      const req = makeMockReq({
        params: { taskId: '1' },
        headers: { 'x-user-id': '42' },
        body: { content: '   ' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['POST /tasks/:taskId/comments'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/content/i);
    });

    it('returns 201 with the created comment on success', async () => {
      // Arrange
      const insertRow = { id: 10, task_id: 1, user_id: '42', content: 'hello', parent_comment_id: null };
      const fullRow = { ...insertRow, author_name: 'Alice', author_avatar_color: '#aaa' };
      mockQuery
        .mockResolvedValueOnce({ rows: [insertRow] })   // INSERT
        .mockResolvedValueOnce({ rows: [fullRow] });      // SELECT with author

      const req = makeMockReq({
        params: { taskId: '1' },
        headers: { 'x-user-id': '42' },
        body: { content: 'hello' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['POST /tasks/:taskId/comments'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(res._json).toMatchObject({ id: 10, content: 'hello', author_name: 'Alice' });
    });
  });

  // -------------------------------------------------------------------------
  // PUT /comments/:id
  // -------------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeMockReq({ params: { id: '5' }, body: { content: 'updated' } });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['PUT /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/X-User-Id/i);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check: not found

      const req = makeMockReq({
        params: { id: '99' },
        headers: { 'x-user-id': '42' },
        body: { content: 'updated' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['PUT /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/not found/i);
    });

    it('returns 403 when the requester is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '7' }] }); // owned by user 7

      const req = makeMockReq({
        params: { id: '5' },
        headers: { 'x-user-id': '42' }, // different user
        body: { content: 'updated' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['PUT /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/own/i);
    });

    it('returns 400 when updated content is blank', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '42' }] }); // ownership check passes

      const req = makeMockReq({
        params: { id: '5' },
        headers: { 'x-user-id': '42' },
        body: { content: '' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['PUT /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/content/i);
    });

    it('returns 200 with updated comment when authorized and valid', async () => {
      // Arrange
      const updatedRow = { id: 5, content: 'updated text', user_id: '42' };
      const fullRow = { ...updatedRow, author_name: 'Bob', author_avatar_color: '#bbb' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: '42' }] })  // ownership check
        .mockResolvedValueOnce({ rows: [updatedRow] })           // UPDATE
        .mockResolvedValueOnce({ rows: [fullRow] });              // SELECT with author

      const req = makeMockReq({
        params: { id: '5' },
        headers: { 'x-user-id': '42' },
        body: { content: 'updated text' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['PUT /comments/:id'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res._json).toMatchObject({ id: 5, content: 'updated text', author_name: 'Bob' });
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /comments/:id
  // -------------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const req = makeMockReq({ params: { id: '5' } });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['DELETE /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/X-User-Id/i);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check: not found

      const req = makeMockReq({
        params: { id: '99' },
        headers: { 'x-user-id': '42' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['DELETE /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/not found/i);
    });

    it('returns 403 when the requester is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '7' }] }); // owned by user 7

      const req = makeMockReq({
        params: { id: '5' },
        headers: { 'x-user-id': '42' }, // different user
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['DELETE /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0] as Error & { status: number };
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/own/i);
    });

    it('returns 200 with confirmation when authorized', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: '42' }] })  // ownership check
        .mockResolvedValueOnce({ rows: [] });                     // DELETE

      const req = makeMockReq({
        params: { id: '5' },
        headers: { 'x-user-id': '42' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      // Act
      await routeHandlers['DELETE /comments/:id'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res._json).toMatchObject({ message: 'Comment deleted', id: '5' });
    });
  });
});
