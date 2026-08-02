/**
 * Unit tests for concept/apps/api/src/routes/comments.js
 *
 * Key behaviors under test:
 *  - X-User-Id header is required for write operations
 *  - 404 when comment does not exist
 *  - 403 when the requesting user is not the comment author
 *  - 400 when content is missing or blank
 */

import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Minimal Express Router mock
// ---------------------------------------------------------------------------

function createMockRouter() {
  const router: any = { stack: [] };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = function (path: string, handler: Function) {
      this.stack.push({
        route: {
          path,
          methods: { [method]: true },
          stack: [{ handle: handler }],
        },
      });
    };
  }
  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function findHandler(router: any, method: string, routePath: string): Function | undefined {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.path === routePath &&
      l.route.methods[method.toLowerCase()],
  );
  if (!layer) return undefined;
  const routeLayers = layer.route.stack;
  return routeLayers[routeLayers.length - 1].handle;
}

function loadRouterWithMockPool(queryResponses: Array<{ rows: any[] }>) {
  delete require.cache[commentsModulePath];

  let callIndex = 0;
  const mockQuery = vi.fn(async () => {
    const response = queryResponses[callIndex] ?? { rows: [] };
    callIndex++;
    return response;
  });
  const mockPool = { query: mockQuery };

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: createMockRouter };
    }
    if (request === '../services/database' || request.endsWith('services/database.js')) {
      return { getPool: () => mockPool };
    }
    if (
      request === '../middleware/errorHandler' ||
      request.endsWith('middleware/errorHandler.js')
    ) {
      return originalLoad(errorHandlerModulePath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  const router = require(commentsModulePath);
  return { router, mockQuery };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /tasks/:taskId/comments', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns comments for a task', async () => {
    // Arrange
    const fakeComments = [{ id: '1', content: 'Hello', author_name: 'Alice' }];
    const { router } = loadRouterWithMockPool([{ rows: fakeComments }]);
    const handler = findHandler(router, 'get', '/tasks/:taskId/comments')!;
    const req: any = { params: { taskId: '42' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(fakeComments);
  });

  it('calls next(err) on database error', async () => {
    // Arrange
    delete require.cache[commentsModulePath];
    const dbError = new Error('connection refused');
    const mockPool = { query: vi.fn().mockRejectedValue(dbError) };
    Module._load = (request: string, parent: unknown, isMain: boolean) => {
      if (request === 'express') return { Router: createMockRouter };
      if (request === '../services/database' || request.endsWith('services/database.js')) {
        return { getPool: () => mockPool };
      }
      if (request === '../middleware/errorHandler' || request.endsWith('middleware/errorHandler.js')) {
        return originalLoad(errorHandlerModulePath, parent, isMain);
      }
      return originalLoad(request, parent, isMain);
    };
    const router = require(commentsModulePath);
    const handler = findHandler(router, 'get', '/tasks/:taskId/comments')!;
    const req: any = { params: { taskId: '42' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});

describe('POST /tasks/:taskId/comments', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments')!;
    const req: any = { params: { taskId: '42' }, body: { content: 'Hi' }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/);
  });

  it('returns 400 when content is empty', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments')!;
    const req: any = {
      params: { taskId: '42' },
      body: { content: '   ' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content/i);
  });

  it('returns 400 when content is absent', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments')!;
    const req: any = {
      params: { taskId: '42' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('inserts the comment and returns 201 with author details', async () => {
    // Arrange
    const insertedRow = { id: 'c-1', task_id: '42', content: 'Looks good', user_id: 'user-1' };
    const commentWithAuthor = { ...insertedRow, author_name: 'Alice', author_avatar_color: '#f00' };
    const { router } = loadRouterWithMockPool([
      { rows: [insertedRow] },
      { rows: [commentWithAuthor] },
    ]);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments')!;
    const req: any = {
      params: { taskId: '42' },
      body: { content: 'Looks good' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(commentWithAuthor);
  });
});

describe('PUT /comments/:id — authorization and validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'put', '/comments/:id')!;
    const req: any = { params: { id: 'c-1' }, body: { content: 'Updated' }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/);
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([{ rows: [] }]);
    const handler = findHandler(router, 'put', '/comments/:id')!;
    const req: any = {
      params: { id: 'c-999' },
      body: { content: 'Updated' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('returns 403 when requesting user is not the comment author', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([
      { rows: [{ user_id: 'user-other' }] },
    ]);
    const handler = findHandler(router, 'put', '/comments/:id')!;
    const req: any = {
      params: { id: 'c-1' },
      body: { content: 'Updated' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own comments/i);
  });

  it('returns 400 when content is blank after ownership check passes', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([
      { rows: [{ user_id: 'user-1' }] },
    ]);
    const handler = findHandler(router, 'put', '/comments/:id')!;
    const req: any = {
      params: { id: 'c-1' },
      body: { content: '   ' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content/i);
  });

  it('updates and returns the comment when author edits their own comment', async () => {
    // Arrange
    const updatedRow = { id: 'c-1', content: 'Updated text', user_id: 'user-1' };
    const commentWithAuthor = { ...updatedRow, author_name: 'Alice', author_avatar_color: '#abc' };
    const { router } = loadRouterWithMockPool([
      { rows: [{ user_id: 'user-1' }] },
      { rows: [updatedRow] },
      { rows: [commentWithAuthor] },
    ]);
    const handler = findHandler(router, 'put', '/comments/:id')!;
    const req: any = {
      params: { id: 'c-1' },
      body: { content: 'Updated text' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(commentWithAuthor);
  });
});

describe('DELETE /comments/:id — authorization', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'delete', '/comments/:id')!;
    const req: any = { params: { id: 'c-1' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/);
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([{ rows: [] }]);
    const handler = findHandler(router, 'delete', '/comments/:id')!;
    const req: any = {
      params: { id: 'c-999' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('returns 403 when requesting user is not the comment author', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([{ rows: [{ user_id: 'user-other' }] }]);
    const handler = findHandler(router, 'delete', '/comments/:id')!;
    const req: any = {
      params: { id: 'c-1' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own comments/i);
  });

  it('deletes the comment and returns a confirmation when the author deletes their own comment', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([
      { rows: [{ user_id: 'user-1' }] },
      { rows: [] },
    ]);
    const handler = findHandler(router, 'delete', '/comments/:id')!;
    const req: any = {
      params: { id: 'c-1' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'c-1' });
  });
});
