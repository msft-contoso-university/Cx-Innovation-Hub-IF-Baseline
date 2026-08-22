import { describe, expect, it } from 'vitest';

import {
  createNext,
  createRequest,
  createResponse,
  loadRoutes,
  type QueryCall,
} from './routeTestHarness';

const AUTHOR_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const COMMENT_ROW = { id: 'comment-1', task_id: 'task-1', user_id: AUTHOR_ID, content: 'Hello' };

/** Default double: ownership lookup returns the author, other queries the comment row. */
function ownedByAuthor(call: QueryCall) {
  if (call.sql.includes('SELECT user_id FROM comments')) {
    return { rows: [{ user_id: AUTHOR_ID }] };
  }
  return { rows: [COMMENT_ROW] };
}

describe('comments routes', () => {
  describe('POST /tasks/:taskId/comments', () => {
    it('creates a comment for the caller identified by X-User-Id', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { taskId: 'task-1' },
        body: { content: '  Looks good  ' },
        headers: { 'X-User-Id': AUTHOR_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/tasks/:taskId/comments')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(COMMENT_ROW);
      expect(routes.queries[0].params).toEqual(['task-1', AUTHOR_ID, null, 'Looks good']);
    });

    it('threads the comment under a parent when parent_comment_id is provided', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { taskId: 'task-1' },
        body: { content: 'Reply', parent_comment_id: 'comment-0' },
        headers: { 'X-User-Id': AUTHOR_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/tasks/:taskId/comments')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(routes.queries[0].params[2]).toBe('comment-0');
    });

    it('rejects requests without the X-User-Id header', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({ params: { taskId: 'task-1' }, body: { content: 'Hi' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/tasks/:taskId/comments')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
      expect(routes.queries).toHaveLength(0);
    });

    it.each([
      ['missing content', {}],
      ['whitespace-only content', { content: '   ' }],
    ])('rejects %s with 400', async (_label, body) => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { taskId: 'task-1' },
        body,
        headers: { 'X-User-Id': AUTHOR_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/tasks/:taskId/comments')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 400, message: 'Comment content is required' });
      expect(routes.queries).toHaveLength(0);
    });
  });

  describe('PUT /comments/:id', () => {
    it('updates the comment when the caller is the author', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { id: 'comment-1' },
        body: { content: '  Edited  ' },
        headers: { 'X-User-Id': AUTHOR_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('put', '/comments/:id')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(res.body).toEqual(COMMENT_ROW);
      const update = routes.queries.find((q) => q.sql.includes('UPDATE comments'));
      expect(update?.params).toEqual(['Edited', 'comment-1']);
    });

    it('returns 403 and does not update when the caller is not the author', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { id: 'comment-1' },
        body: { content: 'Hijack' },
        headers: { 'X-User-Id': OTHER_USER_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('put', '/comments/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({
        status: 403,
        message: 'You can only edit your own comments',
      });
      expect(routes.queries.some((q) => q.sql.includes('UPDATE comments'))).toBe(false);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', () => ({ rows: [] }));
      const req = createRequest({
        params: { id: 'missing' },
        body: { content: 'Edited' },
        headers: { 'X-User-Id': AUTHOR_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('put', '/comments/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 404, message: 'Comment not found' });
    });

    it('checks ownership before validating content', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { id: 'comment-1' },
        body: { content: '   ' },
        headers: { 'X-User-Id': OTHER_USER_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('put', '/comments/:id')(req, res, next);

      // Assert
      expect(next.error?.status).toBe(403);
    });

    it('rejects blank content from the author with 400', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { id: 'comment-1' },
        body: { content: '   ' },
        headers: { 'X-User-Id': AUTHOR_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('put', '/comments/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 400, message: 'Comment content is required' });
      expect(routes.queries.some((q) => q.sql.includes('UPDATE comments'))).toBe(false);
    });
  });

  describe('DELETE /comments/:id', () => {
    it('deletes the comment when the caller is the author', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { id: 'comment-1' },
        headers: { 'X-User-Id': AUTHOR_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('delete', '/comments/:id')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(res.body).toEqual({ message: 'Comment deleted', id: 'comment-1' });
      expect(routes.queries.some((q) => q.sql.startsWith('DELETE FROM comments'))).toBe(true);
    });

    it('returns 403 and performs no delete for a non-author', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({
        params: { id: 'comment-1' },
        headers: { 'X-User-Id': OTHER_USER_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('delete', '/comments/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({
        status: 403,
        message: 'You can only delete your own comments',
      });
      expect(routes.queries.some((q) => q.sql.startsWith('DELETE FROM comments'))).toBe(false);
    });

    it('requires the X-User-Id header', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', ownedByAuthor);
      const req = createRequest({ params: { id: 'comment-1' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('delete', '/comments/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
      expect(routes.queries).toHaveLength(0);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const routes = loadRoutes('comments.js', () => ({ rows: [] }));
      const req = createRequest({
        params: { id: 'missing' },
        headers: { 'X-User-Id': AUTHOR_ID },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('delete', '/comments/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 404, message: 'Comment not found' });
    });
  });
});
