import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse, findRouteHandler, loadRouterWithMockedPool } from './routeTestHelpers';

const routerModulePath = '../../../../apps/api/src/routes/comments.js';

describe('comments routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /tasks/:taskId/comments returns comments for the task', async () => {
    // Arrange
    const rows = [{ id: 'c1', task_id: 't1', content: 'Looks good' }];
    const query = vi.fn().mockResolvedValue({ rows });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/tasks/:taskId/comments');
    const req = { params: { taskId: 't1' }, body: {}, headers: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(res.body).toEqual(rows);
  });

  it('POST /tasks/:taskId/comments requires an X-User-Id header', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'post', '/tasks/:taskId/comments');
    const req = { params: { taskId: 't1' }, body: { content: 'hello' }, headers: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toBe('X-User-Id header is required');
  });

  it('POST /tasks/:taskId/comments rejects blank content', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'post', '/tasks/:taskId/comments');
    const req = { params: { taskId: 't1' }, body: { content: '   ' }, headers: { 'x-user-id': 'u1' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toBe('Comment content is required');
  });

  it('POST /tasks/:taskId/comments creates a comment trimmed and threaded', async () => {
    // Arrange
    const createdComment = { id: 'c2', task_id: 't1', user_id: 'u1', content: 'Trimmed comment' };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'c2' }] })
      .mockResolvedValueOnce({ rows: [createdComment] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'post', '/tasks/:taskId/comments');
    const req = {
      params: { taskId: 't1' },
      body: { content: '  Trimmed comment  ', parent_comment_id: 'c0' },
      headers: { 'x-user-id': 'u1' },
    };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO comments'), [
      't1',
      'u1',
      'c0',
      'Trimmed comment',
    ]);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(createdComment);
  });

  it('PUT /comments/:id requires an X-User-Id header', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'put', '/comments/:id');
    const req = { params: { id: 'c1' }, body: { content: 'edit' }, headers: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('PUT /comments/:id returns 404 when the comment does not exist', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'put', '/comments/:id');
    const req = { params: { id: 'missing' }, body: { content: 'edit' }, headers: { 'x-user-id': 'u1' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toBe('Comment not found');
  });

  it('PUT /comments/:id returns 403 when the requester is not the author', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'owner-1' }] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'put', '/comments/:id');
    const req = { params: { id: 'c1' }, body: { content: 'edit' }, headers: { 'x-user-id': 'intruder' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toBe('You can only edit your own comments');
  });

  it('PUT /comments/:id rejects blank content from the owner', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'owner-1' }] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'put', '/comments/:id');
    const req = { params: { id: 'c1' }, body: { content: '  ' }, headers: { 'x-user-id': 'owner-1' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toBe('Comment content is required');
  });

  it('PUT /comments/:id updates the comment when the requester is the author', async () => {
    // Arrange
    const updatedComment = { id: 'c1', content: 'Updated text', user_id: 'owner-1' };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [updatedComment] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'put', '/comments/:id');
    const req = { params: { id: 'c1' }, body: { content: '  Updated text  ' }, headers: { 'x-user-id': 'owner-1' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE comments SET content'), [
      'Updated text',
      'c1',
    ]);
    expect(res.body).toEqual(updatedComment);
  });

  it('DELETE /comments/:id requires an X-User-Id header', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'delete', '/comments/:id');
    const req = { params: { id: 'c1' }, body: {}, headers: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('DELETE /comments/:id returns 404 when the comment does not exist', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'delete', '/comments/:id');
    const req = { params: { id: 'missing' }, body: {}, headers: { 'x-user-id': 'u1' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toBe('Comment not found');
  });

  it('DELETE /comments/:id returns 403 when the requester is not the author', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'owner-1' }] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'delete', '/comments/:id');
    const req = { params: { id: 'c1' }, body: {}, headers: { 'x-user-id': 'intruder' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toBe('You can only delete your own comments');
  });

  it('DELETE /comments/:id deletes the comment when the requester is the author', async () => {
    // Arrange
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'delete', '/comments/:id');
    const req = { params: { id: 'c1' }, body: {}, headers: { 'x-user-id': 'owner-1' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenNthCalledWith(2, 'DELETE FROM comments WHERE id = $1', ['c1']);
    expect(res.body).toEqual({ message: 'Comment deleted', id: 'c1' });
  });

  it('forwards database errors to next()', async () => {
    // Arrange
    const dbError = new Error('connection lost');
    const query = vi.fn().mockRejectedValue(dbError);
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/tasks/:taskId/comments');
    const req = { params: { taskId: 't1' }, body: {}, headers: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});
