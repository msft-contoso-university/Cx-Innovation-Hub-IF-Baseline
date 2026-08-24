/**
 * Unit tests for concept/apps/api/src/routes/comments.js
 *
 * Focus: author-only authorization (403/404) and input validation for the
 * edit/delete paths, which are exercised by the new Locust comment lifecycle
 * scenario but previously had no automated behavioural coverage.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { loadRouter, nextError, type LoadedRouter } from '../helpers/routeHarness';

const AUTHOR_ID = 'user-1';
const OTHER_ID = 'user-2';

describe('comments routes', () => {
  let router: LoadedRouter;

  beforeEach(() => {
    router = loadRouter('comments');
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('rejects requests without the X-User-Id header', async () => {
      // Arrange & Act
      const { next, res } = await router.invoke('post', '/tasks/:taskId/comments', {
        params: { taskId: 't1' },
        body: { content: 'hello' },
      });

      // Assert
      expect(nextError(next).status).toBe(400);
      expect(nextError(next).message).toBe('X-User-Id header is required');
      expect(router.query).not.toHaveBeenCalled();
      expect(res.body).toBeUndefined();
    });

    it('rejects whitespace-only content', async () => {
      // Arrange & Act
      const { next } = await router.invoke('post', '/tasks/:taskId/comments', {
        params: { taskId: 't1' },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '   ' },
      });

      // Assert
      expect(nextError(next).status).toBe(400);
      expect(nextError(next).message).toBe('Comment content is required');
      expect(router.query).not.toHaveBeenCalled();
    });

    it('trims content, defaults parent_comment_id to null and returns 201', async () => {
      // Arrange
      router.query
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'hello' }] });

      // Act
      const { res, next } = await router.invoke('post', '/tasks/:taskId/comments', {
        params: { taskId: 't1' },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '  hello  ' },
      });

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(router.query.mock.calls[0][1]).toEqual(['t1', AUTHOR_ID, null, 'hello']);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 'c1', content: 'hello' });
    });
  });

  describe('PUT /comments/:id', () => {
    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      router.query.mockResolvedValueOnce({ rows: [] });

      // Act
      const { next } = await router.invoke('put', '/comments/:id', {
        params: { id: 'missing' },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: 'edited' },
      });

      // Assert
      expect(nextError(next).status).toBe(404);
      expect(nextError(next).message).toBe('Comment not found');
    });

    it('returns 403 when the requester is not the author', async () => {
      // Arrange
      router.query.mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] });

      // Act
      const { next } = await router.invoke('put', '/comments/:id', {
        params: { id: 'c1' },
        headers: { 'x-user-id': OTHER_ID },
        body: { content: 'edited' },
      });

      // Assert
      expect(nextError(next).status).toBe(403);
      expect(nextError(next).message).toBe('You can only edit your own comments');
      expect(router.query).toHaveBeenCalledTimes(1); // ownership check only, no UPDATE
    });

    it('updates the comment for its author', async () => {
      // Arrange
      router.query
        .mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'edited' }] });

      // Act
      const { res, next } = await router.invoke('put', '/comments/:id', {
        params: { id: 'c1' },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '  edited  ' },
      });

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(router.query.mock.calls[1][1]).toEqual(['edited', 'c1']);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ id: 'c1', content: 'edited' });
    });
  });

  describe('DELETE /comments/:id', () => {
    it('returns 403 when the requester is not the author', async () => {
      // Arrange
      router.query.mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] });

      // Act
      const { next } = await router.invoke('delete', '/comments/:id', {
        params: { id: 'c1' },
        headers: { 'x-user-id': OTHER_ID },
      });

      // Assert
      expect(nextError(next).status).toBe(403);
      expect(nextError(next).message).toBe('You can only delete your own comments');
      expect(router.query).toHaveBeenCalledTimes(1); // no DELETE issued
    });

    it('deletes the comment for its author', async () => {
      // Arrange
      router.query
        .mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      const { res, next } = await router.invoke('delete', '/comments/:id', {
        params: { id: 'c1' },
        headers: { 'x-user-id': AUTHOR_ID },
      });

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(router.query.mock.calls[1][1]).toEqual(['c1']);
      expect(res.body).toEqual({ message: 'Comment deleted', id: 'c1' });
    });
  });

  it('forwards database failures to the error handler', async () => {
    // Arrange
    const dbError = new Error('connection lost');
    router.query.mockRejectedValueOnce(dbError);

    // Act
    const { next } = await router.invoke('get', '/tasks/:taskId/comments', {
      params: { taskId: 't1' },
    });

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});
