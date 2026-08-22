import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResponse,
  getHandler,
  loadRouteModule,
  type LoadedRouter,
} from '../../helpers/expressRouterHarness';

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  } as any;
}

describe('comments routes', () => {
  let query: ReturnType<typeof vi.fn>;
  let router: LoadedRouter;

  beforeEach(() => {
    query = vi.fn();
    router = loadRouteModule('comments.js', query);
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('creates a comment with the trimmed content for the header user', async () => {
      // Arrange
      query
        .mockResolvedValueOnce({ rows: [{ id: 11 }] })
        .mockResolvedValueOnce({ rows: [{ id: 11, content: 'Nice work' }] });
      const req = createRequest({
        params: { taskId: '3' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: '  Nice work  ' },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'POST /tasks/:taskId/comments')(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(query.mock.calls[0][1]).toEqual(['3', 'user-1', null, 'Nice work']);
    });

    it('rejects the request when the X-User-Id header is missing', async () => {
      // Arrange
      const req = createRequest({ params: { taskId: '3' }, body: { content: 'Nice work' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'POST /tasks/:taskId/comments')(req, res, next);

      // Assert
      expect(query).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 400,
        message: 'X-User-Id header is required',
      });
    });

    it('rejects whitespace-only content', async () => {
      // Arrange
      const req = createRequest({
        params: { taskId: '3' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: '   ' },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'POST /tasks/:taskId/comments')(req, res, next);

      // Assert
      expect(query).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 400,
        message: 'Comment content is required',
      });
    });
  });

  describe('PUT /comments/:id', () => {
    it('lets the author edit their own comment', async () => {
      // Arrange
      query
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 11 }] })
        .mockResolvedValueOnce({ rows: [{ id: 11, content: 'Updated' }] });
      const req = createRequest({
        params: { id: '11' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: '  Updated  ' },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PUT /comments/:id')(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(query.mock.calls[1][1]).toEqual(['Updated', '11']);
      expect(res.body).toEqual({ id: 11, content: 'Updated' });
    });

    it('returns 403 when a different user tries to edit the comment', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
      const req = createRequest({
        params: { id: '11' },
        headers: { 'x-user-id': 'user-2' },
        body: { content: 'Hijacked' },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PUT /comments/:id')(req, res, next);

      // Assert
      expect(query).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 403,
        message: 'You can only edit your own comments',
      });
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [] });
      const req = createRequest({
        params: { id: '404' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'Updated' },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PUT /comments/:id')(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Comment not found' });
    });

    it('rejects empty content after the ownership check passes', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
      const req = createRequest({
        params: { id: '11' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: '   ' },
      });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'PUT /comments/:id')(req, res, next);

      // Assert
      expect(query).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 400,
        message: 'Comment content is required',
      });
    });
  });

  describe('DELETE /comments/:id', () => {
    it('deletes the comment when the requester is the author', async () => {
      // Arrange
      query
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const req = createRequest({ params: { id: '11' }, headers: { 'x-user-id': 'user-1' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'DELETE /comments/:id')(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(query.mock.calls[1][0]).toContain('DELETE FROM comments');
      expect(res.body).toEqual({ message: 'Comment deleted', id: '11' });
    });

    it('returns 403 and performs no delete for a non-author', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
      const req = createRequest({ params: { id: '11' }, headers: { 'x-user-id': 'user-2' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'DELETE /comments/:id')(req, res, next);

      // Assert
      expect(query).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 403,
        message: 'You can only delete your own comments',
      });
    });

    it('requires the X-User-Id header', async () => {
      // Arrange
      const req = createRequest({ params: { id: '11' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'DELETE /comments/:id')(req, res, next);

      // Assert
      expect(query).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 400,
        message: 'X-User-Id header is required',
      });
    });
  });
});
