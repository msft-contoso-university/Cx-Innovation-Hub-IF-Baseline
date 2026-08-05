import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const realExpress = require('express');

const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const databaseServicePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();

function createMockRes() {
  const res: {
    statusCode: number;
    body?: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => typeof res;
  } = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function loadCommentsRouter() {
  delete require.cache[commentsRoutePath];
  delete require.cache[databaseServicePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return realExpress;
    }
    if (request === '../services/database' || request === './services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsRoutePath);
}

function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

describe('comments routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  it('POST /tasks/:taskId/comments requires an X-User-Id header', async () => {
    // Arrange
    const router = loadCommentsRouter();
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
    const req = { params: { taskId: '1' }, body: { content: 'hi' }, headers: {} };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST /tasks/:taskId/comments requires non-empty content', async () => {
    // Arrange
    const router = loadCommentsRouter();
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
    const req = { params: { taskId: '1' }, body: { content: '   ' }, headers: { 'x-user-id': '1' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('PUT /comments/:id rejects edits from a non-author', async () => {
    // Arrange
    const router = loadCommentsRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '2' }] });
    const req = {
      params: { id: '1' },
      body: { content: 'edited' },
      headers: { 'x-user-id': '1' },
    };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  it('PUT /comments/:id returns 404 when the comment does not exist', async () => {
    // Arrange
    const router = loadCommentsRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = {
      params: { id: '1' },
      body: { content: 'edited' },
      headers: { 'x-user-id': '1' },
    };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('PUT /comments/:id updates content when the requester is the author', async () => {
    // Arrange
    const router = loadCommentsRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, content: 'edited' }] });
    const req = {
      params: { id: '1' },
      body: { content: 'edited' },
      headers: { 'x-user-id': '1' },
    };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toEqual({ id: 1, content: 'edited' });
  });

  it('DELETE /comments/:id rejects deletion from a non-author', async () => {
    // Arrange
    const router = loadCommentsRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '2' }] });
    const req = { params: { id: '1' }, headers: { 'x-user-id': '1' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next.mock.calls[0][0].status).toBe(403);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('DELETE /comments/:id deletes when the requester is the author', async () => {
    // Arrange
    const router = loadCommentsRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: '1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: '1' }, headers: { 'x-user-id': '1' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toEqual({ message: 'Comment deleted', id: '1' });
  });
});
