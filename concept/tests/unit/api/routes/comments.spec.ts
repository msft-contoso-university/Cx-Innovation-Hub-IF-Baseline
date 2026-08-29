import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');

type Handler = (req: any, res: any, next: any) => Promise<void> | void;

const query = vi.fn();

const AUTHOR_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';

function createRouterStub(routes: Map<string, Handler>) {
  const register = (method: string) => (path: string, handler: Handler) => {
    routes.set(`${method} ${path}`, handler);
  };

  return {
    get: register('GET'),
    post: register('POST'),
    put: register('PUT'),
    patch: register('PATCH'),
    delete: register('DELETE'),
  };
}

function loadCommentsRoutes(): Map<string, Handler> {
  const routes = new Map<string, Handler>();

  delete require.cache[commentsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => createRouterStub(routes) };
    }

    if (request === '../services/database') {
      return { getPool: () => ({ query }) };
    }

    return originalLoad(request, parent, isMain);
  };

  require(commentsModulePath);

  return routes;
}

function createResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('comments routes', () => {
  let routes: Map<string, Handler>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = loadCommentsRoutes();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  it('rejects a new comment when the X-User-Id header is missing', async () => {
    // Arrange
    const handler = routes.get('POST /tasks/:taskId/comments')!;
    const next = vi.fn();

    // Act
    await handler({ params: { taskId: '1' }, headers: {}, body: { content: 'hi' } }, createResponse(), next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 400,
      message: 'X-User-Id header is required',
    });
  });

  it('rejects a new comment with whitespace-only content', async () => {
    // Arrange
    const handler = routes.get('POST /tasks/:taskId/comments')!;
    const next = vi.fn();

    // Act
    await handler(
      { params: { taskId: '1' }, headers: { 'x-user-id': AUTHOR_ID }, body: { content: '  \n ' } },
      createResponse(),
      next
    );

    // Assert
    expect(query).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 400,
      message: 'Comment content is required',
    });
  });

  it('trims content and defaults parent_comment_id to null when creating a comment', async () => {
    // Arrange
    const handler = routes.get('POST /tasks/:taskId/comments')!;
    query
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'Looks good' }] });
    const res = createResponse();

    // Act
    await handler(
      {
        params: { taskId: 't1' },
        headers: { 'x-user-id': AUTHOR_ID },
        body: { content: '  Looks good  ' },
      },
      res,
      vi.fn()
    );

    // Assert
    expect(query.mock.calls[0][1]).toEqual(['t1', AUTHOR_ID, null, 'Looks good']);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 'c1', content: 'Looks good' });
  });

  it('returns 403 when a non-author tries to edit a comment', async () => {
    // Arrange
    const handler = routes.get('PUT /comments/:id')!;
    query.mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] });
    const next = vi.fn();

    // Act
    await handler(
      {
        params: { id: 'c1' },
        headers: { 'x-user-id': OTHER_USER_ID },
        body: { content: 'malicious edit' },
      },
      createResponse(),
      next
    );

    // Assert
    expect(query).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 403,
      message: 'You can only edit your own comments',
    });
  });

  it('returns 404 when editing a comment that does not exist', async () => {
    // Arrange
    const handler = routes.get('PUT /comments/:id')!;
    query.mockResolvedValueOnce({ rows: [] });
    const next = vi.fn();

    // Act
    await handler(
      { params: { id: 'missing' }, headers: { 'x-user-id': AUTHOR_ID }, body: { content: 'edit' } },
      createResponse(),
      next
    );

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 404,
      message: 'Comment not found',
    });
  });

  it('checks ownership before validating content when editing a comment', async () => {
    // Arrange
    const handler = routes.get('PUT /comments/:id')!;
    query.mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] });
    const next = vi.fn();

    // Act
    await handler(
      { params: { id: 'c1' }, headers: { 'x-user-id': AUTHOR_ID }, body: { content: '   ' } },
      createResponse(),
      next
    );

    // Assert
    expect(query).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 400,
      message: 'Comment content is required',
    });
  });

  it('updates a comment for its author', async () => {
    // Arrange
    const handler = routes.get('PUT /comments/:id')!;
    query
      .mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1', content: 'Edited' }] });
    const res = createResponse();
    const next = vi.fn();

    // Act
    await handler(
      { params: { id: 'c1' }, headers: { 'x-user-id': AUTHOR_ID }, body: { content: ' Edited ' } },
      res,
      next
    );

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(query.mock.calls[1][1]).toEqual(['Edited', 'c1']);
    expect(res.body).toEqual({ id: 'c1', content: 'Edited' });
  });

  it('returns 403 and does not delete when a non-author tries to delete a comment', async () => {
    // Arrange
    const handler = routes.get('DELETE /comments/:id')!;
    query.mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] });
    const next = vi.fn();

    // Act
    await handler(
      { params: { id: 'c1' }, headers: { 'x-user-id': OTHER_USER_ID }, body: {} },
      createResponse(),
      next
    );

    // Assert
    expect(query).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 403,
      message: 'You can only delete your own comments',
    });
  });

  it('deletes a comment for its author', async () => {
    // Arrange
    const handler = routes.get('DELETE /comments/:id')!;
    query
      .mockResolvedValueOnce({ rows: [{ user_id: AUTHOR_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = createResponse();
    const next = vi.fn();

    // Act
    await handler({ params: { id: 'c1' }, headers: { 'x-user-id': AUTHOR_ID }, body: {} }, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(query.mock.calls[1]).toEqual(['DELETE FROM comments WHERE id = $1', ['c1']]);
    expect(res.body).toEqual({ message: 'Comment deleted', id: 'c1' });
  });

  it('forwards database failures to the error handler', async () => {
    // Arrange
    const handler = routes.get('GET /tasks/:taskId/comments')!;
    const failure = new Error('connection lost');
    query.mockRejectedValueOnce(failure);
    const next = vi.fn();

    // Act
    await handler({ params: { taskId: 't1' } }, createResponse(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(failure);
  });
});
