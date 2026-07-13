/**
 * Unit tests for comments route handlers.
 *
 * Focuses on the authorization and validation logic that is unique to this
 * module:
 *   - X-User-Id header requirement (POST, PUT, DELETE)
 *   - Comment content validation (POST, PUT)
 *   - Ownership check: only the comment author can edit or delete (PUT, DELETE)
 *   - 404 handling for unknown comments
 *
 * The database module is intercepted via Module._load so tests are isolated.
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const databasePath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');
const expressModule = require('express');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

type MockQuery = ReturnType<typeof vi.fn>;

function loadCommentsRouter(queryImpl: MockQuery) {
  delete require.cache[commentsRoutePath];
  delete require.cache[databasePath];
  delete require.cache[errorHandlerPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return expressModule;
    if (request === '../services/database' || request === databasePath) {
      return { getPool: () => ({ query: queryImpl }) };
    }
    if (request === '../middleware/errorHandler' || request === errorHandlerPath) {
      return originalLoad(errorHandlerPath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsRoutePath);
}

type RouteLayer = {
  route?: { methods: Record<string, boolean>; path: string; stack: Array<{ handle: Function }> };
};

function findHandler(router: { stack: RouteLayer[] }, method: string, path: string) {
  return router.stack.find(
    (l) => l.route?.methods?.[method] && l.route?.path === path,
  )?.route?.stack?.[0]?.handle;
}

// ---------------------------------------------------------------------------
// POST /tasks/:taskId/comments — header + content validation
// ---------------------------------------------------------------------------
describe('POST /tasks/:taskId/comments — validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  it('returns 400 when X-User-Id header is absent', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req = { params: { taskId: 't1' }, body: { content: 'Hello' }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/x-user-id/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 when content is missing', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req = {
      params: { taskId: 't1' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content/i);
  });

  it('returns 400 when content is blank', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req = {
      params: { taskId: 't1' },
      body: { content: '   ' },
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });

  it('creates a comment and returns 201 when input is valid', async () => {
    // Arrange
    const inserted = { id: 'c1', content: 'LGTM', task_id: 't1', user_id: 'user-1' };
    const withAuthor = { ...inserted, author_name: 'Alice', author_avatar_color: '#fff' };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [inserted] })   // INSERT
      .mockResolvedValueOnce({ rows: [withAuthor] }); // SELECT with author join

    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req = {
      params: { taskId: 't1' },
      body: { content: 'LGTM' },
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(withAuthor);
  });
});

// ---------------------------------------------------------------------------
// PUT /comments/:id — ownership authorization
// ---------------------------------------------------------------------------
describe('PUT /comments/:id — authorization', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  it('returns 400 when X-User-Id header is absent', async () => {
    const query = vi.fn();
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req = { params: { id: 'c1' }, body: { content: 'Updated' }, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 404 when comment does not exist', async () => {
    // DB returns no rows for ownership check
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req = {
      params: { id: 'unknown' },
      body: { content: 'Hello' },
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(404);
  });

  it('returns 403 when a different user tries to edit the comment', async () => {
    // Arrange — comment belongs to user-2
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-2' }] });
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req = {
      params: { id: 'c1' },
      body: { content: 'Tampered' },
      headers: { 'x-user-id': 'user-1' }, // different user
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('returns 400 when content is empty after ownership passes', async () => {
    // Arrange — comment belongs to user-1
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req = {
      params: { id: 'c1' },
      body: { content: '' },
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });

  it('updates the comment when the owner provides valid content', async () => {
    // Arrange
    const existing = { user_id: 'user-1' };
    const updated = { id: 'c1', content: 'Edited', user_id: 'user-1' };
    const withAuthor = { ...updated, author_name: 'Bob', author_avatar_color: '#abc' };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [existing] })  // ownership check
      .mockResolvedValueOnce({ rows: [updated] })   // UPDATE
      .mockResolvedValueOnce({ rows: [withAuthor] }); // SELECT with author join

    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req = {
      params: { id: 'c1' },
      body: { content: 'Edited' },
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(withAuthor);
  });
});

// ---------------------------------------------------------------------------
// DELETE /comments/:id — ownership authorization
// ---------------------------------------------------------------------------
describe('DELETE /comments/:id — authorization', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  it('returns 400 when X-User-Id header is absent', async () => {
    const query = vi.fn();
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req = { params: { id: 'c1' }, body: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 404 when comment does not exist', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req = {
      params: { id: 'none' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(404);
  });

  it('returns 403 when a different user tries to delete the comment', async () => {
    // Arrange — comment belongs to user-2
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-2' }] });
    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req = {
      params: { id: 'c1' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('deletes the comment and returns a success message for the owner', async () => {
    // Arrange
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })  // ownership check
      .mockResolvedValueOnce({ rows: [] });                       // DELETE

    const router = loadCommentsRouter(query);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req = {
      params: { id: 'c1' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });
});
