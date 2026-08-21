import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');

const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

function loadCommentsRouter() {
  delete require.cache[commentsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }

    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createMockRes() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('comments routes', () => {
  let router: any;

  beforeEach(() => {
    vi.clearAllMocks();
    router = loadCommentsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('rejects a request missing the X-User-Id header', async () => {
      // Arrange
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      const req = { params: { taskId: 't1' }, body: { content: 'hi' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects an empty comment body', async () => {
      // Arrange
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
      const req = {
        params: { taskId: 't1' },
        body: { content: '   ' },
        headers: { 'x-user-id': 'u1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' })
      );
    });
  });

  describe('PUT /comments/:id (authorization)', () => {
    it('rejects a request missing the X-User-Id header', async () => {
      // Arrange
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = { params: { id: 'c1' }, body: { content: 'edit' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns a 404 error when the comment does not exist', async () => {
      // Arrange
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = {
        params: { id: 'missing' },
        body: { content: 'edit' },
        headers: { 'x-user-id': 'u1' },
      };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Comment not found' })
      );
    });

    it('rejects editing a comment owned by a different user with a 403 error', async () => {
      // Arrange
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = {
        params: { id: 'c1' },
        body: { content: 'edit' },
        headers: { 'x-user-id': 'u2' },
      };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only edit your own comments' })
      );
    });

    it('rejects an empty content update from the comment owner', async () => {
      // Arrange
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = {
        params: { id: 'c1' },
        body: { content: '  ' },
        headers: { 'x-user-id': 'u1' },
      };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' })
      );
    });

    it('allows the comment owner to edit their own comment', async () => {
      // Arrange
      const handler = getHandler(router, 'put', '/comments/:id');
      const req = {
        params: { id: 'c1' },
        body: { content: '  updated text  ' },
        headers: { 'x-user-id': 'u1' },
      };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'updated text' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE comments SET content'),
        ['updated text', 'c1']
      );
      expect(res.json).toHaveBeenCalledWith({ id: 'c1', content: 'updated text' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /comments/:id (authorization)', () => {
    it('rejects a request missing the X-User-Id header', async () => {
      // Arrange
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = { params: { id: 'c1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns a 404 error when the comment does not exist', async () => {
      // Arrange
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = { params: { id: 'missing' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('rejects deleting a comment owned by a different user with a 403 error', async () => {
      // Arrange
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = { params: { id: 'c1' }, headers: { 'x-user-id': 'u2' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only delete your own comments' })
      );
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('allows the comment owner to delete their own comment', async () => {
      // Arrange
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req = { params: { id: 'c1' }, headers: { 'x-user-id': 'u1' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM comments WHERE id = $1',
        ['c1']
      );
      expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'c1' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
