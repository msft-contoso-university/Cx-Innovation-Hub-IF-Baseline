import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandler, loadRouteModule } from './routeTestHelpers';

const mockQuery = vi.fn();

describe('routes/comments', () => {
  let router: { stack: unknown[] };

  beforeEach(() => {
    mockQuery.mockReset();
    router = loadRouteModule('../../../../apps/api/src/routes/comments.js', mockQuery);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('rejects requests missing the X-User-Id header', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      const req = createMockReq({ params: { taskId: '1' }, body: { content: 'hello' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects blank comment content', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/tasks/:taskId/comments');
      const req = createMockReq({
        params: { taskId: '1' },
        body: { content: '   ' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: 'Comment content is required' }));
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('PUT /comments/:id', () => {
    it('rejects requests missing the X-User-Id header', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req = createMockReq({ params: { id: '1' }, body: { content: 'edit' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req = createMockReq({
        params: { id: '999' },
        body: { content: 'edit' },
        headers: { 'x-user-id': 'user-1' },
      });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: 'Comment not found' }));
    });

    it('returns 403 when the requester is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] });
      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req = createMockReq({
        params: { id: '1' },
        body: { content: 'edit' },
        headers: { 'x-user-id': 'intruder' },
      });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only edit your own comments' })
      );
    });

    it('updates and returns the comment when the requester is the author', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // update
        .mockResolvedValueOnce({ rows: [{ id: 1, content: 'edited', author_name: 'Owner' }] }); // fetch with author
      const handler = getRouteHandler(router, 'put', '/comments/:id');
      const req = createMockReq({
        params: { id: '1' },
        body: { content: '  edited  ' },
        headers: { 'x-user-id': 'owner-1' },
      });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 1, content: 'edited', author_name: 'Owner' });
      expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE comments'), ['edited', '1']);
    });
  });

  describe('DELETE /comments/:id', () => {
    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      const req = createMockReq({ params: { id: '999' }, headers: { 'x-user-id': 'user-1' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: 'Comment not found' }));
    });

    it('returns 403 when the requester is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] });
      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      const req = createMockReq({ params: { id: '1' }, headers: { 'x-user-id': 'intruder' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only delete your own comments' })
      );
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('deletes the comment when the requester is the author', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] }); // delete
      const handler = getRouteHandler(router, 'delete', '/comments/:id');
      const req = createMockReq({ params: { id: '1' }, headers: { 'x-user-id': 'owner-1' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ message: 'Comment deleted', id: '1' });
    });
  });
});
