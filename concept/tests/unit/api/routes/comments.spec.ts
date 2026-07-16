import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  require,
  createMockPool,
  createMockRes,
  getRouteHandler,
  loadRouteModule,
  Module,
  originalLoad,
} from './_helpers.js';

const commentsModulePath = require.resolve(
  '../../../../apps/api/src/routes/comments.js',
);

describe('comments routes', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let router: any;
  let teardown: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ mockPool, mockQuery } = createMockPool());
    ({ router, teardown } = await loadRouteModule(commentsModulePath, {
      getPool: () => mockPool,
    }));
  });

  afterEach(() => {
    teardown();
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // POST /tasks/:taskId/comments
  // -------------------------------------------------------------------------

  describe('POST /tasks/:taskId/comments', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      const req: any = {
        body: { content: 'Hello' },
        params: { taskId: 't1' },
        headers: {},
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when content is missing', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      const req: any = {
        body: {},
        params: { taskId: 't1' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' }),
      );
    });

    it('calls next with 400 when content is whitespace only', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      const req: any = {
        body: { content: '   ' },
        params: { taskId: 't1' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('creates comment and responds 201 on success', async () => {
      // Arrange
      const comment = {
        id: 'c1',
        task_id: 't1',
        user_id: 'user-1',
        content: 'Hello',
        author_name: 'Alice',
        author_avatar_color: '#fff',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })  // insert
        .mockResolvedValueOnce({ rows: [comment] });       // select with author

      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      const req: any = {
        body: { content: 'Hello' },
        params: { taskId: 't1' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(comment);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PUT /comments/:id  — edit comment (authorization enforced)
  // -------------------------------------------------------------------------

  describe('PUT /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req: any = {
        body: { content: 'Updated' },
        params: { id: 'c1' },
        headers: {},
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check returns empty

      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req: any = {
        body: { content: 'Updated' },
        params: { id: 'ghost' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Comment not found' }),
      );
    });

    it('calls next with 403 when user is not the comment author', async () => {
      // Arrange — comment belongs to user-2, but request is from user-1
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req: any = {
        body: { content: 'Unauthorized edit' },
        params: { id: 'c1' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert — authorization failure
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          message: 'You can only edit your own comments',
        }),
      );
      // Should NOT proceed to update
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('calls next with 400 when content is missing after auth passes', async () => {
      // Arrange — comment belongs to user-1
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req: any = {
        body: {},
        params: { id: 'c1' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Comment content is required' }),
      );
    });

    it('updates and returns the comment when author and content are valid', async () => {
      // Arrange
      const updated = {
        id: 'c1',
        content: 'Fixed text',
        author_name: 'Alice',
        author_avatar_color: '#fff',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [updated] })               // update
        .mockResolvedValueOnce({ rows: [updated] });              // select with author

      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req: any = {
        body: { content: 'Fixed text' },
        params: { id: 'c1' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(updated);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /comments/:id  — delete comment (authorization enforced)
  // -------------------------------------------------------------------------

  describe('DELETE /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      const req: any = {
        body: {},
        params: { id: 'c1' },
        headers: {},
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      const req: any = {
        body: {},
        params: { id: 'ghost' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Comment not found' }),
      );
    });

    it('calls next with 403 when user is not the comment author', async () => {
      // Arrange — comment belongs to user-2
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      const req: any = {
        body: {},
        params: { id: 'c1' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert — authorization failure
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          message: 'You can only delete your own comments',
        }),
      );
      // Should NOT proceed to delete
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('deletes the comment and returns confirmation when authorized', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] });                     // delete

      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      const req: any = {
        body: {},
        params: { id: 'c1' },
        headers: { 'x-user-id': 'user-1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'c1' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /tasks/:taskId/comments
  // -------------------------------------------------------------------------

  describe('GET /tasks/:taskId/comments', () => {
    it('returns all comments for a task', async () => {
      // Arrange
      const comments = [{ id: 'c1', content: 'A' }, { id: 'c2', content: 'B' }];
      mockQuery.mockResolvedValueOnce({ rows: comments });

      const handler = getRouteHandler(router, 'get', '/tasks/:taskId/comments');
      const req: any = { body: {}, params: { taskId: 't1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(comments);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
