import { describe, expect, it } from 'vitest';

import { loadRouter, type QueryMock } from './routeHarness';

const AUTHOR_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const COMMENT_ID = '33333333-3333-3333-3333-333333333333';
const TASK_ID = '44444444-4444-4444-4444-444444444444';

function queryQueue(responses: Array<{ rows: unknown[] }>): QueryMock {
  const queue = [...responses];
  return async () => queue.shift() ?? { rows: [] };
}

describe('comments routes', () => {
  describe('POST /tasks/:taskId/comments', () => {
    it('requires the X-User-Id header', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([]));

      // Act
      const { error } = await harness.call('POST', '/tasks/:taskId/comments', {
        params: { taskId: TASK_ID },
        body: { content: 'hello' },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(error?.message).toBe('X-User-Id header is required');
      expect(harness.queries).toHaveLength(0);
    });

    it('rejects blank content with 400', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([]));

      // Act
      const { error } = await harness.call('POST', '/tasks/:taskId/comments', {
        params: { taskId: TASK_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '   ' },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(error?.message).toBe('Comment content is required');
      expect(harness.queries).toHaveLength(0);
    });

    it('stores the trimmed content, the header author and a null parent by default', async () => {
      // Arrange
      const hydrated = { id: COMMENT_ID, content: 'hello' };
      const harness = loadRouter(
        'comments.js',
        queryQueue([{ rows: [{ id: COMMENT_ID }] }, { rows: [hydrated] }])
      );

      // Act
      const { res, error } = await harness.call('POST', '/tasks/:taskId/comments', {
        params: { taskId: TASK_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '  hello  ' },
      });

      // Assert
      expect(error).toBeUndefined();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(hydrated);
      expect(harness.queries[0].params).toEqual([TASK_ID, AUTHOR_ID, null, 'hello']);
    });
  });

  describe('PUT /comments/:id', () => {
    it('requires the X-User-Id header', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([]));

      // Act
      const { error } = await harness.call('PUT', '/comments/:id', {
        params: { id: COMMENT_ID },
        body: { content: 'edited' },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(harness.queries).toHaveLength(0);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([{ rows: [] }]));

      // Act
      const { error } = await harness.call('PUT', '/comments/:id', {
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: 'edited' },
      });

      // Assert
      expect(error?.status).toBe(404);
      expect(error?.message).toBe('Comment not found');
    });

    it('returns 403 and performs no update when the requester is not the author', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([{ rows: [{ user_id: AUTHOR_ID }] }]));

      // Act
      const { error } = await harness.call('PUT', '/comments/:id', {
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': OTHER_USER_ID },
        body: { content: 'edited' },
      });

      // Assert
      expect(error?.status).toBe(403);
      expect(error?.message).toBe('You can only edit your own comments');
      expect(harness.queries).toHaveLength(1);
    });

    it('rejects blank content after the ownership check', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([{ rows: [{ user_id: AUTHOR_ID }] }]));

      // Act
      const { error } = await harness.call('PUT', '/comments/:id', {
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '  ' },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(harness.queries).toHaveLength(1);
    });

    it('updates the comment with trimmed content for the author', async () => {
      // Arrange
      const hydrated = { id: COMMENT_ID, content: 'edited' };
      const harness = loadRouter(
        'comments.js',
        queryQueue([
          { rows: [{ user_id: AUTHOR_ID }] },
          { rows: [{ id: COMMENT_ID }] },
          { rows: [hydrated] },
        ])
      );

      // Act
      const { res, error } = await harness.call('PUT', '/comments/:id', {
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: ' edited ' },
      });

      // Assert
      expect(error).toBeUndefined();
      expect(res.body).toEqual(hydrated);
      expect(harness.queries[1].params).toEqual(['edited', COMMENT_ID]);
    });
  });

  describe('DELETE /comments/:id', () => {
    it('requires the X-User-Id header', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([]));

      // Act
      const { error } = await harness.call('DELETE', '/comments/:id', {
        params: { id: COMMENT_ID },
      });

      // Assert
      expect(error?.status).toBe(400);
      expect(harness.queries).toHaveLength(0);
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([{ rows: [] }]));

      // Act
      const { error } = await harness.call('DELETE', '/comments/:id', {
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': AUTHOR_ID },
      });

      // Assert
      expect(error?.status).toBe(404);
    });

    it('returns 403 and does not delete when the requester is not the author', async () => {
      // Arrange
      const harness = loadRouter('comments.js', queryQueue([{ rows: [{ user_id: AUTHOR_ID }] }]));

      // Act
      const { error } = await harness.call('DELETE', '/comments/:id', {
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': OTHER_USER_ID },
      });

      // Assert
      expect(error?.status).toBe(403);
      expect(error?.message).toBe('You can only delete your own comments');
      expect(harness.queries).toHaveLength(1);
    });

    it('deletes the comment for its author', async () => {
      // Arrange
      const harness = loadRouter(
        'comments.js',
        queryQueue([{ rows: [{ user_id: AUTHOR_ID }] }, { rows: [] }])
      );

      // Act
      const { res, error } = await harness.call('DELETE', '/comments/:id', {
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': AUTHOR_ID },
      });

      // Assert
      expect(error).toBeUndefined();
      expect(res.body).toEqual({ message: 'Comment deleted', id: COMMENT_ID });
      expect(harness.queries[1].params).toEqual([COMMENT_ID]);
    });
  });
});
