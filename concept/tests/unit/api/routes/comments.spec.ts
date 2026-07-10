import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');

let mockQuery: ReturnType<typeof vi.fn>;

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

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method] === true
  );
  return layer?.route?.stack?.[0]?.handle;
}

function makeReqRes(headerOverrides: Record<string, string> = {}) {
  const req: any = {
    params: {},
    body: {},
    headers: { ...headerOverrides },
  };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('comments router', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
    router = await loadCommentsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ---------------------------------------------------------------------------
  // GET /tasks/:taskId/comments
  // ---------------------------------------------------------------------------
  describe('GET /tasks/:taskId/comments', () => {
    it('returns list of comments for a task', async () => {
      // Arrange
      const comments = [
        { id: 1, task_id: 10, user_id: 'u1', content: 'Hello', author_name: 'Alice' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: comments });
      const { req, res, next } = makeReqRes();
      req.params = { taskId: '10' };
      const handler = getHandler(router, 'get', '/tasks/:taskId/comments');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(comments);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /tasks/:taskId/comments
  // ---------------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes(); // no X-User-Id
      req.params = { taskId: '1' };
      req.body = { content: 'A comment' };
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when content is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { taskId: '1' };
      req.body = {}; // no content
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when content is whitespace only', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { taskId: '1' };
      req.body = { content: '   ' };
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' })
      );
    });

    it('creates a comment and returns 201 on success', async () => {
      // Arrange
      const newComment = {
        id: 5, task_id: 1, user_id: 'user-1', parent_comment_id: null,
        content: 'Great work!', author_name: 'Alice', author_avatar_color: '#abc',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // INSERT
        .mockResolvedValueOnce({ rows: [newComment] }); // SELECT with author

      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { taskId: '1' };
      req.body = { content: 'Great work!' };
      const handler = getHandler(router, 'post', '/tasks/:taskId/comments');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newComment);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /comments/:id — edit requires ownership
  // ---------------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes(); // no X-User-Id
      req.params = { id: '1' };
      req.body = { content: 'Updated' };
      const handler = getHandler(router, 'put', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check returns empty
      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { id: '99' };
      req.body = { content: 'Updated' };
      const handler = getHandler(router, 'put', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Comment not found' })
      );
    });

    it('returns 403 when user is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] }); // ownership check
      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { id: '1' };
      req.body = { content: 'Updated' };
      const handler = getHandler(router, 'put', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only edit your own comments' })
      );
    });

    it('returns 400 when content is missing after ownership passes', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }); // ownership passes
      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { id: '1' };
      req.body = {}; // no content
      const handler = getHandler(router, 'put', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' })
      );
    });

    it('updates the comment and returns it when ownership matches', async () => {
      // Arrange
      const updatedComment = {
        id: 1, task_id: 5, user_id: 'user-1', content: 'Fixed!',
        author_name: 'Alice', author_avatar_color: '#abc',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })             // UPDATE
        .mockResolvedValueOnce({ rows: [updatedComment] });        // SELECT with author

      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { id: '1' };
      req.body = { content: 'Fixed!' };
      const handler = getHandler(router, 'put', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(updatedComment);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /comments/:id — delete requires ownership
  // ---------------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes(); // no X-User-Id
      req.params = { id: '1' };
      const handler = getHandler(router, 'delete', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check finds nothing
      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { id: '99' };
      const handler = getHandler(router, 'delete', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Comment not found' })
      );
    });

    it('returns 403 when user is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] }); // ownership check
      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { id: '1' };
      const handler = getHandler(router, 'delete', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only delete your own comments' })
      );
    });

    it('deletes the comment and returns confirmation when ownership matches', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] });                       // DELETE

      const { req, res, next } = makeReqRes({ 'x-user-id': 'user-1' });
      req.params = { id: '3' };
      const handler = getHandler(router, 'delete', '/comments/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: '3' });
    });
  });
});
