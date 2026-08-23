import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');

const mockQuery = vi.fn();

function createMockRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

async function loadCommentsRouter() {
  delete require.cache[commentsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

describe('comments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('rejects a request missing the X-User-Id header with a 400 error', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      const req = { params: { taskId: 't1' }, body: { content: 'hi' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects empty comment content with a 400 error', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      const req = { params: { taskId: 't1' }, body: { content: '   ' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates a comment for the authenticated user', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'hi', user_id: 'u1' }] });
      const req = { params: { taskId: 't1' }, body: { content: 'hi' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.statusCode).toBe(201);
      expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 'u1', null, 'hi']);
    });
  });

  describe('PUT /comments/:id', () => {
    it('rejects a request missing the X-User-Id header with a 400 error', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = { params: { id: 'c1' }, body: { content: 'edit' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns a 404 error when the comment does not exist', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: 'missing' }, body: { content: 'edit' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('returns a 403 error when a non-author tries to edit the comment', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner' }] });
      const req = { params: { id: 'c1' }, body: { content: 'edit' }, headers: { 'x-user-id': 'intruder' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects empty content with a 400 error even for the author', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });
      const req = { params: { id: 'c1' }, body: { content: '  ' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
    });

    it('updates the comment when the author matches', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'edited' }] });
      const req = { params: { id: 'c1' }, body: { content: 'edited' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 'c1', content: 'edited' });
    });
  });

  describe('DELETE /comments/:id', () => {
    it('rejects a request missing the X-User-Id header with a 400 error', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = { params: { id: 'c1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns a 404 error when the comment does not exist', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'delete', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: 'missing' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('returns a 403 error when a non-author tries to delete the comment', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'delete', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner' }] });
      const req = { params: { id: 'c1' }, headers: { 'x-user-id': 'intruder' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('deletes the comment when the author matches', async () => {
      // Arrange
      const router = await loadCommentsRouter();
      const handler = getHandler(router, 'delete', '/comments/:id');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: 'c1' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ message: 'Comment deleted', id: 'c1' });
    });
  });
});
