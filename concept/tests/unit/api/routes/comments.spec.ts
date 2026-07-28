/**
 * Unit tests for comments route — focuses on input validation and ownership
 * authorization logic (the paths that don't change across DB implementations).
 *
 * Uses Module._load interception (CommonJS mocking pattern) so that
 * `getPool` is replaced with a test double before the module is loaded.
 */

import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

function makeQueryMock(rows: Record<string, unknown>[] = []) {
  return vi.fn().mockResolvedValue({ rows });
}

function makePool(queryMock = makeQueryMock()) {
  return { query: queryMock };
}

function makeResMock() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<{
  headers: Record<string, string>;
  params: Record<string, string>;
  body: Record<string, unknown>;
}> = {}) {
  return {
    headers: {},
    params: {},
    body: {},
    ...overrides,
  };
}

async function loadComments(pool: ReturnType<typeof makePool>) {
  delete require.cache[commentsModulePath];

  // Pre-resolve express from the test directory where it is installed,
  // so that comments.js (in the API app) can find it even though it
  // is not installed inside concept/apps/api/node_modules.
  const expressModule = require('express');

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return expressModule;
    }
    if (request === '../services/database' || request.endsWith('services/database.js')) {
      return { getPool: () => pool };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

// Resolve handler by exact method + path from the Express router stack.
function getHandler(router: any, method: string, routePath: string) {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.methods[method.toLowerCase()] &&
      l.route.path === routePath,
  );
  if (!layer) throw new Error(`No ${method} ${routePath} handler found`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Module._load = originalLoad;
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:taskId/comments
// ---------------------------------------------------------------------------

describe('POST /api/tasks/:taskId/comments — input validation', () => {
  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadComments(makePool());
    const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
    const req = makeReq({ params: { taskId: '1' }, body: { content: 'Hello' } });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/i);
  });

  it('calls next with 400 when content is missing', async () => {
    // Arrange
    const router = await loadComments(makePool());
    const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
    const req = makeReq({
      headers: { 'x-user-id': 'user-1' },
      params: { taskId: '1' },
      body: {},
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content/i);
  });

  it('calls next with 400 when content is whitespace only', async () => {
    // Arrange
    const router = await loadComments(makePool());
    const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
    const req = makeReq({
      headers: { 'x-user-id': 'user-1' },
      params: { taskId: '1' },
      body: { content: '   ' },
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('returns 201 with the new comment when input is valid', async () => {
    // Arrange
    const insertedRow = { id: 'c-1', task_id: '1', user_id: 'user-1', content: 'Hello' };
    const commentRow = { ...insertedRow, author_name: 'Alice', author_avatar_color: '#f00' };

    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [insertedRow] })   // INSERT
      .mockResolvedValueOnce({ rows: [commentRow] });   // SELECT with author

    const router = await loadComments(makePool(queryMock));
    const handler = getHandler(router, 'post', '/tasks/:taskId/comments');
    const req = makeReq({
      headers: { 'x-user-id': 'user-1' },
      params: { taskId: '1' },
      body: { content: 'Hello' },
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(commentRow);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/comments/:id — authorization
// ---------------------------------------------------------------------------

describe('PUT /api/comments/:id — authorization and validation', () => {
  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadComments(makePool());
    const handler = getHandler(router, 'put', '/comments/:id');
    const req = makeReq({ params: { id: 'c-1' }, body: { content: 'Updated' } });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/i);
  });

  it('calls next with 404 when the comment does not exist', async () => {
    // Arrange
    const queryMock = makeQueryMock([]); // empty → not found
    const router = await loadComments(makePool(queryMock));
    const handler = getHandler(router, 'put', '/comments/:id');
    const req = makeReq({
      headers: { 'x-user-id': 'user-1' },
      params: { id: 'c-999' },
      body: { content: 'Updated' },
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('calls next with 403 when the requester is not the comment author', async () => {
    // Arrange
    const queryMock = makeQueryMock([{ user_id: 'owner-99' }]); // owner mismatch
    const router = await loadComments(makePool(queryMock));
    const handler = getHandler(router, 'put', '/comments/:id');
    const req = makeReq({
      headers: { 'x-user-id': 'other-user' },
      params: { id: 'c-1' },
      body: { content: 'Updated' },
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('calls next with 400 when content is empty after ownership check passes', async () => {
    // Arrange
    const queryMock = makeQueryMock([{ user_id: 'user-1' }]); // owner matches
    const router = await loadComments(makePool(queryMock));
    const handler = getHandler(router, 'put', '/comments/:id');
    const req = makeReq({
      headers: { 'x-user-id': 'user-1' },
      params: { id: 'c-1' },
      body: {},
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content/i);
  });

  it('returns 200 with updated comment when ownership and input are valid', async () => {
    // Arrange
    const updatedRow = { id: 'c-1', content: 'Updated text', user_id: 'user-1' };
    const commentRow = { ...updatedRow, author_name: 'Alice', author_avatar_color: '#f00' };

    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })  // ownership check
      .mockResolvedValueOnce({ rows: [updatedRow] })               // UPDATE
      .mockResolvedValueOnce({ rows: [commentRow] });              // SELECT with author

    const router = await loadComments(makePool(queryMock));
    const handler = getHandler(router, 'put', '/comments/:id');
    const req = makeReq({
      headers: { 'x-user-id': 'user-1' },
      params: { id: 'c-1' },
      body: { content: 'Updated text' },
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(commentRow);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/comments/:id — authorization
// ---------------------------------------------------------------------------

describe('DELETE /api/comments/:id — authorization', () => {
  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadComments(makePool());
    const handler = getHandler(router, 'delete', '/comments/:id');
    const req = makeReq({ params: { id: 'c-1' } });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/i);
  });

  it('calls next with 404 when the comment does not exist', async () => {
    // Arrange
    const queryMock = makeQueryMock([]);
    const router = await loadComments(makePool(queryMock));
    const handler = getHandler(router, 'delete', '/comments/:id');
    const req = makeReq({
      headers: { 'x-user-id': 'user-1' },
      params: { id: 'c-999' },
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('calls next with 403 when the requester is not the comment author', async () => {
    // Arrange
    const queryMock = makeQueryMock([{ user_id: 'real-owner' }]);
    const router = await loadComments(makePool(queryMock));
    const handler = getHandler(router, 'delete', '/comments/:id');
    const req = makeReq({
      headers: { 'x-user-id': 'intruder' },
      params: { id: 'c-1' },
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('returns 200 with deleted id when requester owns the comment', async () => {
    // Arrange
    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership SELECT
      .mockResolvedValueOnce({ rows: [] });                       // DELETE

    const router = await loadComments(makePool(queryMock));
    const handler = getHandler(router, 'delete', '/comments/:id');
    const req = makeReq({
      headers: { 'x-user-id': 'user-1' },
      params: { id: 'c-1' },
    });
    const res = makeResMock();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String), id: 'c-1' }),
    );
  });
});
