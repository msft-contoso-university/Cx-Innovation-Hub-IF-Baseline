import { afterEach, describe, expect, it } from 'vitest';

import { loadRoute, type RouteHarness } from './routerHarness';

let harness: RouteHarness | undefined;

function createHarness(): RouteHarness {
  harness = loadRoute('comments');
  return harness;
}

afterEach(() => {
  harness?.dispose();
  harness = undefined;
});

describe('comments routes', () => {
  describe('POST /tasks/:taskId/comments', () => {
    it('requires the X-User-Id header', async () => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('post', '/tasks/:taskId/comments', {
        params: { taskId: 't-1' },
        body: { content: 'Hello' },
      });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toBe('X-User-Id header is required');
      expect(route.queries).toHaveLength(0);
    });

    it('rejects whitespace-only content', async () => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('post', '/tasks/:taskId/comments', {
        params: { taskId: 't-1' },
        headers: { 'x-user-id': 'u-1' },
        body: { content: '   ' },
      });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toBe('Comment content is required');
      expect(route.queries).toHaveLength(0);
    });

    it('creates a trimmed threaded comment and returns 201', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ id: 'c-2' }] });
      route.queueQueryResult({ rows: [{ id: 'c-2', content: 'Hello', author_name: 'Ada' }] });

      // Act
      const result = await route.invoke('post', '/tasks/:taskId/comments', {
        params: { taskId: 't-1' },
        headers: { 'x-user-id': 'u-1' },
        body: { content: '  Hello  ', parent_comment_id: 'c-1' },
      });

      // Assert
      expect(result.statusCode).toBe(201);
      expect(route.queries[0].params).toEqual(['t-1', 'u-1', 'c-1', 'Hello']);
      expect(result.body).toEqual({ id: 'c-2', content: 'Hello', author_name: 'Ada' });
    });
  });

  describe('PUT /comments/:id', () => {
    it('requires the X-User-Id header', async () => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('put', '/comments/:id', {
        params: { id: 'c-1' },
        body: { content: 'Edited' },
      });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(route.queries).toHaveLength(0);
    });

    it('returns 404 for an unknown comment', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [] });

      // Act
      const result = await route.invoke('put', '/comments/:id', {
        params: { id: 'missing' },
        headers: { 'x-user-id': 'u-1' },
        body: { content: 'Edited' },
      });

      // Assert
      expect(result.error?.status).toBe(404);
      expect(result.error?.message).toBe('Comment not found');
    });

    it('returns 403 when the requester is not the author', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ user_id: 'u-2' }] });

      // Act
      const result = await route.invoke('put', '/comments/:id', {
        params: { id: 'c-1' },
        headers: { 'x-user-id': 'u-1' },
        body: { content: 'Edited' },
      });

      // Assert
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe('You can only edit your own comments');
      expect(route.queries).toHaveLength(1);
    });

    it('rejects empty content after the ownership check', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ user_id: 'u-1' }] });

      // Act
      const result = await route.invoke('put', '/comments/:id', {
        params: { id: 'c-1' },
        headers: { 'x-user-id': 'u-1' },
        body: { content: '' },
      });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(route.queries).toHaveLength(1);
    });

    it('updates the comment for its author', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ user_id: 'u-1' }] });
      route.queueQueryResult({ rows: [{ id: 'c-1' }] });
      route.queueQueryResult({ rows: [{ id: 'c-1', content: 'Edited', author_name: 'Ada' }] });

      // Act
      const result = await route.invoke('put', '/comments/:id', {
        params: { id: 'c-1' },
        headers: { 'x-user-id': 'u-1' },
        body: { content: '  Edited  ' },
      });

      // Assert
      expect(result.error).toBeUndefined();
      expect(route.queries[1].params).toEqual(['Edited', 'c-1']);
      expect(result.body).toEqual({ id: 'c-1', content: 'Edited', author_name: 'Ada' });
    });
  });

  describe('DELETE /comments/:id', () => {
    it('requires the X-User-Id header', async () => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('delete', '/comments/:id', { params: { id: 'c-1' } });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(route.queries).toHaveLength(0);
    });

    it('returns 404 for an unknown comment', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [] });

      // Act
      const result = await route.invoke('delete', '/comments/:id', {
        params: { id: 'missing' },
        headers: { 'x-user-id': 'u-1' },
      });

      // Assert
      expect(result.error?.status).toBe(404);
    });

    it('returns 403 and does not delete when the requester is not the author', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ user_id: 'u-2' }] });

      // Act
      const result = await route.invoke('delete', '/comments/:id', {
        params: { id: 'c-1' },
        headers: { 'x-user-id': 'u-1' },
      });

      // Assert
      expect(result.error?.status).toBe(403);
      expect(route.queries).toHaveLength(1);
      expect(route.queries[0].text).toContain('SELECT user_id FROM comments');
    });

    it('deletes the comment for its author', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ user_id: 'u-1' }] });
      route.queueQueryResult({ rows: [] });

      // Act
      const result = await route.invoke('delete', '/comments/:id', {
        params: { id: 'c-1' },
        headers: { 'x-user-id': 'u-1' },
      });

      // Assert
      expect(result.error).toBeUndefined();
      expect(route.queries[1].text).toContain('DELETE FROM comments');
      expect(result.body).toEqual({ message: 'Comment deleted', id: 'c-1' });
    });
  });
});
