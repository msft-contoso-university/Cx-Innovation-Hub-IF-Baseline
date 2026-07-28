/**
 * Unit tests for the /api comments route handlers.
 *
 * Key behaviors under test:
 *  - X-User-Id header is required for POST, PUT, DELETE
 *  - PUT and DELETE reject requests from non-owners (403)
 *  - PUT and DELETE return 404 when the comment does not exist
 *  - POST validates that content is non-empty
 */

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsRoutePath = require.resolve(
  '../../../../apps/api/src/routes/comments.js'
);
const databasePath = require.resolve(
  '../../../../apps/api/src/services/database.js'
);
const errorHandlerPath = require.resolve(
  '../../../../apps/api/src/middleware/errorHandler.js'
);
// Resolve express from the test project's own node_modules.
const expressModulePath = require.resolve('express');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeNext() {
  return vi.fn();
}

function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) =>
      l.route?.path === path &&
      l.route?.methods?.[method.toLowerCase()]
  );
  if (!layer) throw new Error(`No ${method} ${path} found in comments router`);
  return layer.route.stack[0].handle as (
    req: any,
    res: any,
    next: any
  ) => Promise<void>;
}

let mockQuery: ReturnType<typeof vi.fn>;

async function loadRouter() {
  delete require.cache[commentsRoutePath];
  delete require.cache[databasePath];

  mockQuery = vi.fn();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return originalLoad(expressModulePath, parent, isMain);
    }
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databasePath) {
        return { getPool: () => ({ query: mockQuery }) };
      }
      if (resolved === errorHandlerPath) {
        return originalLoad(errorHandlerPath, parent, isMain);
      }
    } catch {}
    return originalLoad(request, parent, isMain);
  };

  return require(commentsRoutePath);
}

afterEach(() => {
  Module._load = originalLoad;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:taskId/comments
// ---------------------------------------------------------------------------
describe('POST /tasks/:taskId/comments (create comment)', () => {
  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
    const req: any = {
      params: { taskId: 't1' },
      headers: {},
      body: { content: 'Hello' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/i);
  });

  it('calls next with 400 when content is empty', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
    const req: any = {
      params: { taskId: 't1' },
      headers: { 'x-user-id': 'user-1' },
      body: { content: '   ' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content is required/i);
  });

  it('creates the comment and responds 201 on success', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');
    const created = { id: 'c1', content: 'LGTM', author_name: 'Alice' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [created] });

    const req: any = {
      params: { taskId: 't1' },
      headers: { 'x-user-id': 'user-1' },
      body: { content: 'LGTM' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(created);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/comments/:id — edit (author-only)
// ---------------------------------------------------------------------------
describe('PUT /comments/:id (edit comment)', () => {
  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    const req: any = {
      params: { id: 'c1' },
      headers: {},
      body: { content: 'Updated' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/i);
  });

  it('calls next with 404 when comment does not exist', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check returns empty

    const req: any = {
      params: { id: 'ghost' },
      headers: { 'x-user-id': 'user-1' },
      body: { content: 'Updated' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('calls next with 403 when a different user tries to edit', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-id' }] });

    const req: any = {
      params: { id: 'c1' },
      headers: { 'x-user-id': 'other-user' },
      body: { content: 'Sneaky edit' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('calls next with 400 when content is empty', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

    const req: any = {
      params: { id: 'c1' },
      headers: { 'x-user-id': 'user-1' },
      body: { content: '' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content is required/i);
  });

  it('updates and returns the comment when the author edits', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    const updated = { id: 'c1', content: 'Revised', author_name: 'Alice' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })           // update
      .mockResolvedValueOnce({ rows: [updated] });                // fetch

    const req: any = {
      params: { id: 'c1' },
      headers: { 'x-user-id': 'user-1' },
      body: { content: 'Revised' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(updated);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/comments/:id — delete (author-only)
// ---------------------------------------------------------------------------
describe('DELETE /comments/:id (delete comment)', () => {
  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    const req: any = {
      params: { id: 'c1' },
      headers: {},
      body: {},
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/i);
  });

  it('calls next with 404 when comment does not exist', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req: any = {
      params: { id: 'ghost' },
      headers: { 'x-user-id': 'user-1' },
      body: {},
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('calls next with 403 when a different user tries to delete', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-id' }] });

    const req: any = {
      params: { id: 'c1' },
      headers: { 'x-user-id': 'intruder' },
      body: {},
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('deletes the comment and returns a success message when author deletes', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership
      .mockResolvedValueOnce({});                                 // delete

    const req: any = {
      params: { id: 'c1' },
      headers: { 'x-user-id': 'user-1' },
      body: {},
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/deleted/i) })
    );
  });
});
