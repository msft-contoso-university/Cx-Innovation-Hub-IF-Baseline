import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockResponse,
  findRoute,
  invokeHandler,
  loadRouterModule,
} from './routeTestUtils';

const ROUTE_PATH = '../../../../apps/api/src/routes/comments.js';

describe('comments routes', () => {
  let routes: ReturnType<typeof loadRouterModule>['routes'];
  let mockQuery: ReturnType<typeof loadRouterModule>['mockQuery'];

  beforeEach(() => {
    ({ routes, mockQuery } = loadRouterModule(ROUTE_PATH));
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /tasks/:taskId/comments', () => {
    it('returns comments for a task', async () => {
      // Arrange
      const comments = [{ id: 'c1', content: 'Hello' }];
      mockQuery.mockResolvedValueOnce({ rows: comments });
      const handler = findRoute(routes, 'get', '/tasks/:taskId/comments');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { params: { taskId: 't1' } }, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(comments);
    });
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('rejects when X-User-Id header is missing', async () => {
      // Arrange
      const handler = findRoute(routes, 'post', '/tasks/:taskId/comments');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { taskId: 't1' }, headers: {}, body: { content: 'Hi' } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects when content is missing', async () => {
      // Arrange
      const handler = findRoute(routes, 'post', '/tasks/:taskId/comments');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { taskId: 't1' }, headers: { 'x-user-id': 'u1' }, body: {} },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'Comment content is required' });
    });

    it('creates a comment and returns 201', async () => {
      // Arrange
      const created = { id: 'c1', content: 'Hi', user_id: 'u1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [created] });
      const handler = findRoute(routes, 'post', '/tasks/:taskId/comments');
      const res = createMockResponse();

      // Act
      await invokeHandler(
        handler,
        { params: { taskId: 't1' }, headers: { 'x-user-id': 'u1' }, body: { content: 'Hi' } },
        res,
      );

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });

  describe('PUT /comments/:id', () => {
    it('rejects when X-User-Id header is missing', async () => {
      // Arrange
      const handler = findRoute(routes, 'put', '/comments/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'c1' }, headers: {}, body: { content: 'Edited' } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'put', '/comments/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'missing' }, headers: { 'x-user-id': 'u1' }, body: { content: 'Edited' } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 404, message: 'Comment not found' });
    });

    it('rejects edits from a user who is not the author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner' }] });
      const handler = findRoute(routes, 'put', '/comments/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        {
          params: { id: 'c1' },
          headers: { 'x-user-id': 'someone-else' },
          body: { content: 'Edited' },
        },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({
        status: 403,
        message: 'You can only edit your own comments',
      });
    });

    it('rejects when content is missing', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });
      const handler = findRoute(routes, 'put', '/comments/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'c1' }, headers: { 'x-user-id': 'u1' }, body: {} },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'Comment content is required' });
    });

    it('updates the comment when the author matches', async () => {
      // Arrange
      const updated = { id: 'c1', content: 'Edited', user_id: 'u1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [updated] });
      const handler = findRoute(routes, 'put', '/comments/:id');
      const res = createMockResponse();

      // Act
      await invokeHandler(
        handler,
        { params: { id: 'c1' }, headers: { 'x-user-id': 'u1' }, body: { content: 'Edited' } },
        res,
      );

      // Assert
      expect(res.json).toHaveBeenCalledWith(updated);
    });
  });

  describe('DELETE /comments/:id', () => {
    it('rejects when X-User-Id header is missing', async () => {
      // Arrange
      const handler = findRoute(routes, 'delete', '/comments/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'c1' }, headers: {} },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'delete', '/comments/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'missing' }, headers: { 'x-user-id': 'u1' } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 404, message: 'Comment not found' });
    });

    it('rejects deletes from a user who is not the author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner' }] });
      const handler = findRoute(routes, 'delete', '/comments/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'c1' }, headers: { 'x-user-id': 'someone-else' } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({
        status: 403,
        message: 'You can only delete your own comments',
      });
    });

    it('deletes the comment when the author matches', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'delete', '/comments/:id');
      const res = createMockResponse();

      // Act
      await invokeHandler(
        handler,
        { params: { id: 'c1' }, headers: { 'x-user-id': 'u1' } },
        res,
      );

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'c1' });
    });
  });
});
