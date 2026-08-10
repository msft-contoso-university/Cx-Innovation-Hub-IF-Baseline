import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  getRouteHandler,
  loadRouterWithMockPool,
} from './testHelpers';

const COMMENTS_ROUTE_PATH = '../../../../apps/api/src/routes/comments.js';

describe('comments routes', () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery };

  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('rejects the request when the X-User-Id header is missing', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      const req = createMockRequest({ params: { taskId: 'task-1' }, body: { content: 'hi' } });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('X-User-Id header is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects the request when content is missing or blank', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      const req = createMockRequest({
        params: { taskId: 'task-1' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: '   ' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Comment content is required');
    });

    it('creates a comment when content and author are provided', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'comment-1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'comment-1', content: 'hi', user_id: 'user-1', author_name: 'Alice' }],
        });
      const req = createMockRequest({
        params: { taskId: 'task-1' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'hi' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({
        id: 'comment-1',
        content: 'hi',
        user_id: 'user-1',
        author_name: 'Alice',
      });
    });
  });

  describe('PUT /comments/:id', () => {
    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'put', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = createMockRequest({
        params: { id: 'missing-comment' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'edited' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(404);
      expect(next.mock.calls[0][0].message).toBe('Comment not found');
    });

    it('rejects edits from a user who does not own the comment (authorization boundary)', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'put', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] });
      const req = createMockRequest({
        params: { id: 'comment-1' },
        headers: { 'x-user-id': 'someone-else' },
        body: { content: 'edited' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toBe('You can only edit your own comments');
      // Only the ownership lookup should have run; no UPDATE issued.
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('allows the owner to edit their own comment', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'put', '/comments/:id');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'comment-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'comment-1', content: 'edited' }] });
      const req = createMockRequest({
        params: { id: 'comment-1' },
        headers: { 'x-user-id': 'owner-1' },
        body: { content: 'edited' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ id: 'comment-1', content: 'edited' });
    });
  });

  describe('DELETE /comments/:id', () => {
    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = createMockRequest({
        params: { id: 'missing-comment' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('rejects deletion from a user who does not own the comment (authorization boundary)', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] });
      const req = createMockRequest({
        params: { id: 'comment-1' },
        headers: { 'x-user-id': 'intruder' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toBe('You can only delete your own comments');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('allows the owner to delete their own comment', async () => {
      // Arrange
      const router = loadRouterWithMockPool(COMMENTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const req = createMockRequest({
        params: { id: 'comment-1' },
        headers: { 'x-user-id': 'owner-1' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'Comment deleted', id: 'comment-1' });
    });
  });
});
