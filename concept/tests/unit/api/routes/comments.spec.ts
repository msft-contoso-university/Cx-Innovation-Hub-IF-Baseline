import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findRoute,
  loadRouteModule,
  FakeResponse,
  type FakeRouter,
} from './testUtils';

const COMMENTS_MODULE = '../../../../apps/api/src/routes/comments.js';

describe('comments routes', () => {
  let router: FakeRouter;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const loaded = await loadRouteModule(COMMENTS_MODULE);
    router = loaded.router;
    mockQuery = loaded.mockQuery;
  });

  describe('GET /tasks/:taskId/comments', () => {
    it('returns comments for a task', async () => {
      // Arrange
      const comments = [{ id: 'c1', content: 'Looks good' }];
      mockQuery.mockResolvedValueOnce({ rows: comments });
      const handler = findRoute(router, 'get', '/tasks/:taskId/comments');
      const req = { params: { taskId: 't1' } };
      const res = new FakeResponse();

      // Act
      await handler(req, res, () => undefined);

      // Assert
      expect(res.body).toEqual(comments);
    });
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('rejects requests missing the X-User-Id header with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/tasks/:taskId/comments');
      const req = { params: { taskId: 't1' }, headers: {}, body: { content: 'Hi' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number; message?: string };
      });

      // Assert
      expect(receivedErr?.status).toBe(400);
      expect(receivedErr?.message).toBe('X-User-Id header is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects empty content with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/tasks/:taskId/comments');
      const req = {
        params: { taskId: 't1' },
        headers: { 'x-user-id': 'u1' },
        body: { content: '   ' },
      };
      const res = new FakeResponse();
      let receivedErr: { status?: number } | undefined;

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number };
      });

      // Assert
      expect(receivedErr?.status).toBe(400);
    });

    it('creates a comment when the user id and content are present', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/tasks/:taskId/comments');
      const req = {
        params: { taskId: 't1' },
        headers: { 'x-user-id': 'u1' },
        body: { content: 'Nice work', parent_comment_id: null },
      };
      const res = new FakeResponse();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'Nice work' }] });

      // Act
      await handler(req, res, () => undefined);

      // Assert
      expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 'u1', null, 'Nice work']);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 'c1', content: 'Nice work' });
    });
  });

  describe('PUT /comments/:id', () => {
    it('rejects requests missing the X-User-Id header with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'put', '/comments/:id');
      const req = { params: { id: 'c1' }, headers: {}, body: { content: 'Edited' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number } | undefined;

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number };
      });

      // Assert
      expect(receivedErr?.status).toBe(400);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const handler = findRoute(router, 'put', '/comments/:id');
      const req = {
        params: { id: 'missing' },
        headers: { 'x-user-id': 'u1' },
        body: { content: 'Edited' },
      };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number; message?: string };
      });

      // Assert
      expect(receivedErr?.status).toBe(404);
      expect(receivedErr?.message).toBe('Comment not found');
    });

    it('returns 403 when a different user attempts to edit the comment', async () => {
      // Arrange
      const handler = findRoute(router, 'put', '/comments/:id');
      const req = {
        params: { id: 'c1' },
        headers: { 'x-user-id': 'not-the-author' },
        body: { content: 'Edited' },
      };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'author-1' }] });

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number; message?: string };
      });

      // Assert
      expect(receivedErr?.status).toBe(403);
      expect(receivedErr?.message).toBe('You can only edit your own comments');
    });

    it('allows the author to edit their own comment', async () => {
      // Arrange
      const handler = findRoute(router, 'put', '/comments/:id');
      const req = {
        params: { id: 'c1' },
        headers: { 'x-user-id': 'author-1' },
        body: { content: 'Edited content' },
      };
      const res = new FakeResponse();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'author-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'Edited content' }] });

      // Act
      await handler(req, res, () => undefined);

      // Assert
      expect(res.body).toEqual({ id: 'c1', content: 'Edited content' });
    });
  });

  describe('DELETE /comments/:id', () => {
    it('returns 403 when a different user attempts to delete the comment', async () => {
      // Arrange
      const handler = findRoute(router, 'delete', '/comments/:id');
      const req = { params: { id: 'c1' }, headers: { 'x-user-id': 'someone-else' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'author-1' }] });

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number; message?: string };
      });

      // Assert
      expect(receivedErr?.status).toBe(403);
      expect(receivedErr?.message).toBe('You can only delete your own comments');
    });

    it('deletes the comment when the requester is the author', async () => {
      // Arrange
      const handler = findRoute(router, 'delete', '/comments/:id');
      const req = { params: { id: 'c1' }, headers: { 'x-user-id': 'author-1' } };
      const res = new FakeResponse();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'author-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, () => undefined);

      // Assert
      expect(res.body).toEqual({ message: 'Comment deleted', id: 'c1' });
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const handler = findRoute(router, 'delete', '/comments/:id');
      const req = { params: { id: 'missing' }, headers: { 'x-user-id': 'u1' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number } | undefined;
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number };
      });

      // Assert
      expect(receivedErr?.status).toBe(404);
    });
  });
});
