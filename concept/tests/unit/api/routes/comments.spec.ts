import { describe, expect, it } from 'vitest';

import { loadRouter, respondInOrder } from '../support/routeHarness.js';

const AUTHOR_ID = 'u-1';
const COMMENT_ROW = { id: 'c-1', task_id: 't-1', user_id: AUTHOR_ID, content: 'LGTM' };
const COMMENT_WITH_AUTHOR = { ...COMMENT_ROW, author_name: 'Ada', author_avatar_color: '#fff' };

describe('POST /tasks/:taskId/comments', () => {
  it('requires the X-User-Id header', async () => {
    // Arrange
    const router = loadRouter('comments', respondInOrder([]));

    // Act
    const result = await router.invoke('post', '/tasks/:taskId/comments', {
      params: { taskId: 't-1' },
      body: { content: 'LGTM' },
    });

    // Assert
    expect(result.error.status).toBe(400);
    expect(result.error.message).toBe('X-User-Id header is required');
    expect(result.queries).toHaveLength(0);
  });

  it('rejects whitespace-only content', async () => {
    // Arrange
    const router = loadRouter('comments', respondInOrder([]));

    // Act
    const result = await router.invoke('post', '/tasks/:taskId/comments', {
      params: { taskId: 't-1' },
      headers: { 'x-user-id': AUTHOR_ID },
      body: { content: '  \n ' },
    });

    // Assert
    expect(result.error.status).toBe(400);
    expect(result.error.message).toBe('Comment content is required');
    expect(result.queries).toHaveLength(0);
  });

  it('trims content and defaults parent_comment_id to null for top-level comments', async () => {
    // Arrange
    const router = loadRouter(
      'comments',
      respondInOrder([{ rows: [COMMENT_ROW] }, { rows: [COMMENT_WITH_AUTHOR] }])
    );

    // Act
    const result = await router.invoke('post', '/tasks/:taskId/comments', {
      params: { taskId: 't-1' },
      headers: { 'x-user-id': AUTHOR_ID },
      body: { content: '  LGTM  ' },
    });

    // Assert
    expect(result.status).toBe(201);
    expect(result.body).toEqual(COMMENT_WITH_AUTHOR);
    expect(result.queries[0].params).toEqual(['t-1', AUTHOR_ID, null, 'LGTM']);
  });

  it('keeps the parent id for threaded replies', async () => {
    // Arrange
    const router = loadRouter(
      'comments',
      respondInOrder([{ rows: [COMMENT_ROW] }, { rows: [COMMENT_WITH_AUTHOR] }])
    );

    // Act
    const result = await router.invoke('post', '/tasks/:taskId/comments', {
      params: { taskId: 't-1' },
      headers: { 'x-user-id': AUTHOR_ID },
      body: { content: 'Reply', parent_comment_id: 'c-0' },
    });

    // Assert
    expect(result.queries[0].params).toEqual(['t-1', AUTHOR_ID, 'c-0', 'Reply']);
  });
});

describe('PUT /comments/:id', () => {
  it('requires the X-User-Id header', async () => {
    // Arrange
    const router = loadRouter('comments', respondInOrder([]));

    // Act
    const result = await router.invoke('put', '/comments/:id', {
      params: { id: 'c-1' },
      body: { content: 'Edited' },
    });

    // Assert
    expect(result.error.status).toBe(400);
    expect(result.queries).toHaveLength(0);
  });

  it('returns 404 when the comment does not exist', async () => {
    // Arrange
    const router = loadRouter('comments', respondInOrder([{ rows: [] }]));

    // Act
    const result = await router.invoke('put', '/comments/:id', {
      params: { id: 'missing' },
      headers: { 'x-user-id': AUTHOR_ID },
      body: { content: 'Edited' },
    });

    // Assert
    expect(result.error.status).toBe(404);
    expect(result.error.message).toBe('Comment not found');
  });

  it('forbids editing a comment written by another user', async () => {
    // Arrange
    const router = loadRouter('comments', respondInOrder([{ rows: [{ user_id: 'u-2' }] }]));

    // Act
    const result = await router.invoke('put', '/comments/:id', {
      params: { id: 'c-1' },
      headers: { 'x-user-id': AUTHOR_ID },
      body: { content: 'Edited' },
    });

    // Assert
    expect(result.error.status).toBe(403);
    expect(result.error.message).toBe('You can only edit your own comments');
    expect(result.queries).toHaveLength(1);
  });

  it('validates content only after the ownership check passes', async () => {
    // Arrange
    const router = loadRouter('comments', respondInOrder([{ rows: [{ user_id: AUTHOR_ID }] }]));

    // Act
    const result = await router.invoke('put', '/comments/:id', {
      params: { id: 'c-1' },
      headers: { 'x-user-id': AUTHOR_ID },
      body: { content: '   ' },
    });

    // Assert
    expect(result.error.status).toBe(400);
    expect(result.error.message).toBe('Comment content is required');
    expect(result.queries).toHaveLength(1);
  });

  it('updates and returns the comment with author details for the author', async () => {
    // Arrange
    const router = loadRouter(
      'comments',
      respondInOrder([
        { rows: [{ user_id: AUTHOR_ID }] },
        { rows: [COMMENT_ROW] },
        { rows: [COMMENT_WITH_AUTHOR] },
      ])
    );

    // Act
    const result = await router.invoke('put', '/comments/:id', {
      params: { id: 'c-1' },
      headers: { 'x-user-id': AUTHOR_ID },
      body: { content: '  Edited  ' },
    });

    // Assert
    expect(result.status).toBe(200);
    expect(result.body).toEqual(COMMENT_WITH_AUTHOR);
    expect(result.queries[1].params).toEqual(['Edited', 'c-1']);
  });
});

describe('DELETE /comments/:id', () => {
  it('forbids deleting a comment written by another user', async () => {
    // Arrange
    const router = loadRouter('comments', respondInOrder([{ rows: [{ user_id: 'u-2' }] }]));

    // Act
    const result = await router.invoke('delete', '/comments/:id', {
      params: { id: 'c-1' },
      headers: { 'x-user-id': AUTHOR_ID },
    });

    // Assert
    expect(result.error.status).toBe(403);
    expect(result.error.message).toBe('You can only delete your own comments');
    expect(result.queries).toHaveLength(1);
  });

  it('deletes the comment for its author', async () => {
    // Arrange
    const router = loadRouter(
      'comments',
      respondInOrder([{ rows: [{ user_id: AUTHOR_ID }] }, { rows: [] }])
    );

    // Act
    const result = await router.invoke('delete', '/comments/:id', {
      params: { id: 'c-1' },
      headers: { 'x-user-id': AUTHOR_ID },
    });

    // Assert
    expect(result.body).toEqual({ message: 'Comment deleted', id: 'c-1' });
    expect(result.queries[1].params).toEqual(['c-1']);
  });

  it('returns 404 when the comment does not exist', async () => {
    // Arrange
    const router = loadRouter('comments', respondInOrder([{ rows: [] }]));

    // Act
    const result = await router.invoke('delete', '/comments/:id', {
      params: { id: 'missing' },
      headers: { 'x-user-id': AUTHOR_ID },
    });

    // Assert
    expect(result.error.status).toBe(404);
  });
});
