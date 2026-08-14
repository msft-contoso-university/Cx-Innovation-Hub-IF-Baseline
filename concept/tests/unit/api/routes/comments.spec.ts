import { afterEach, describe, expect, it } from 'vitest';

import {
  createRequest,
  createResponse,
  loadRouteModule,
  restoreModuleLoader,
} from './routeTestHarness';

const AUTHOR_ID = 'c4d1b6a6-0000-4000-8000-000000000010';
const OTHER_USER_ID = 'c4d1b6a6-0000-4000-8000-000000000011';
const COMMENT_ID = 'd4d1b6a6-0000-4000-8000-000000000020';
const TASK_ID = 'e4d1b6a6-0000-4000-8000-000000000030';

function handlerFor(key: string, queryResults: unknown[] = []) {
  const { handlers, query } = loadRouteModule('comments.js', queryResults);
  const handler = handlers.get(key);
  if (!handler) {
    throw new Error(`Route not registered: ${key}`);
  }
  return { handler, query };
}

describe('comments routes', () => {
  afterEach(() => {
    restoreModuleLoader();
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('creates a comment for the identified author and returns 201', async () => {
      // Arrange
      const { handler, query } = handlerFor('POST /tasks/:taskId/comments', [
        { rows: [{ id: COMMENT_ID }] },
        { rows: [{ id: COMMENT_ID, content: 'LGTM', author_name: 'Ada' }] },
      ]);
      const req = createRequest({
        params: { taskId: TASK_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '  LGTM  ' },
      });
      const res = createResponse();

      // Act
      await handler(req, res, (err: unknown) => {
        throw err;
      });

      // Assert
      expect(res.statusCode).toBe(201);
      expect(query.mock.calls[0][1]).toEqual([TASK_ID, AUTHOR_ID, null, 'LGTM']);
      expect(res.body).toMatchObject({ id: COMMENT_ID, author_name: 'Ada' });
    });

    it('requires the X-User-Id header', async () => {
      // Arrange
      const { handler, query } = handlerFor('POST /tasks/:taskId/comments');
      const req = createRequest({ params: { taskId: TASK_ID }, body: { content: 'hi' } });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(400);
      expect(error.message).toBe('X-User-Id header is required');
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects whitespace-only content with 400', async () => {
      // Arrange
      const { handler, query } = handlerFor('POST /tasks/:taskId/comments');
      const req = createRequest({
        params: { taskId: TASK_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '   ' },
      });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(400);
      expect(error.message).toBe('Comment content is required');
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('PUT /comments/:id', () => {
    it('allows the author to edit their own comment', async () => {
      // Arrange
      const { handler, query } = handlerFor('PUT /comments/:id', [
        { rows: [{ user_id: AUTHOR_ID }] },
        { rows: [{ id: COMMENT_ID }] },
        { rows: [{ id: COMMENT_ID, content: 'Updated' }] },
      ]);
      const req = createRequest({
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: ' Updated ' },
      });
      const res = createResponse();

      // Act
      await handler(req, res, (err: unknown) => {
        throw err;
      });

      // Assert
      expect(query.mock.calls[1][1]).toEqual(['Updated', COMMENT_ID]);
      expect(res.body).toMatchObject({ content: 'Updated' });
    });

    it('denies editing a comment owned by another user with 403', async () => {
      // Arrange
      const { handler, query } = handlerFor('PUT /comments/:id', [
        { rows: [{ user_id: AUTHOR_ID }] },
      ]);
      const req = createRequest({
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': OTHER_USER_ID },
        body: { content: 'Hijacked' },
      });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(403);
      expect(error.message).toBe('You can only edit your own comments');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('returns 404 before any ownership check when the comment is missing', async () => {
      // Arrange
      const { handler } = handlerFor('PUT /comments/:id', [{ rows: [] }]);
      const req = createRequest({
        params: { id: 'missing' },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: 'Updated' },
      });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(404);
      expect(error.message).toBe('Comment not found');
    });

    it('rejects empty content after the ownership check', async () => {
      // Arrange
      const { handler, query } = handlerFor('PUT /comments/:id', [
        { rows: [{ user_id: AUTHOR_ID }] },
      ]);
      const req = createRequest({
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '   ' },
      });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(400);
      expect(error.message).toBe('Comment content is required');
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE /comments/:id', () => {
    it('deletes a comment owned by the requesting user', async () => {
      // Arrange
      const { handler, query } = handlerFor('DELETE /comments/:id', [
        { rows: [{ user_id: AUTHOR_ID }] },
        { rows: [] },
      ]);
      const req = createRequest({
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': AUTHOR_ID },
      });
      const res = createResponse();

      // Act
      await handler(req, res, (err: unknown) => {
        throw err;
      });

      // Assert
      expect(query).toHaveBeenCalledTimes(2);
      expect(res.body).toEqual({ message: 'Comment deleted', id: COMMENT_ID });
    });

    it('denies deleting another user comment and never issues the delete query', async () => {
      // Arrange
      const { handler, query } = handlerFor('DELETE /comments/:id', [
        { rows: [{ user_id: AUTHOR_ID }] },
      ]);
      const req = createRequest({
        params: { id: COMMENT_ID },
        headers: { 'x-user-id': OTHER_USER_ID },
      });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(403);
      expect(error.message).toBe('You can only delete your own comments');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('requires the X-User-Id header', async () => {
      // Arrange
      const { handler, query } = handlerFor('DELETE /comments/:id');
      const req = createRequest({ params: { id: COMMENT_ID } });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(400);
      expect(query).not.toHaveBeenCalled();
    });
  });
});
