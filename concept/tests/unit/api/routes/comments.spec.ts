/**
 * Unit tests for the comments route handlers.
 *
 * Focuses on the security-critical paths:
 *   - X-User-Id header enforcement (POST, PUT, DELETE)
 *   - Comment ownership checks (PUT and DELETE must reject non-authors)
 *   - Basic input validation (content required)
 *   - 404 when comment does not exist
 *
 * DB interactions are mocked via Module._load interception so no real
 * Postgres connection is required.
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// Pre-load express from the test's own node_modules so we can supply it to
// the route module (which lives outside this package's node_modules tree).
const expressModule = require('express');

const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');

// ---------------------------------------------------------------------------
// Shared mock pool factory
// ---------------------------------------------------------------------------
function makeMockPool(queryImpl: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { query: vi.fn().mockImplementation(queryImpl) };
}

// Helper: extract an individual route handler from an Express router by HTTP
// method and path string (exact match on route.path).
function findHandler(router: any, method: string, routePath: string) {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.methods[method.toLowerCase()] === true &&
      l.route.path === routePath,
  );
  if (!layer) throw new Error(`Handler not found: ${method.toUpperCase()} ${routePath}`);
  // The last handler in the stack is the actual route handler (after any middleware).
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

// ---------------------------------------------------------------------------
// Module loader helper
// ---------------------------------------------------------------------------
async function loadCommentsRouter(mockPool: ReturnType<typeof makeMockPool>) {
  delete require.cache[commentsRoutePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return expressModule;
    }
    if (request === '../services/database') {
      return { getPool: () => mockPool };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsRoutePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('comments route – POST /tasks/:taskId/comments', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req: any = { headers: {}, body: { content: 'hello' }, params: { taskId: '1' } };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
    );
  });

  it('returns 400 when content is empty', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req: any = { headers: { 'x-user-id': 'user-1' }, body: { content: '   ' }, params: { taskId: '1' } };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Comment content is required' }),
    );
  });

  it('returns 400 when content is absent', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req: any = { headers: { 'x-user-id': 'user-1' }, body: {}, params: { taskId: '1' } };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
  });
});

describe('comments route – PUT /comments/:id (ownership enforcement)', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req: any = { headers: {}, body: { content: 'updated' }, params: { id: '42' } };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
    );
    // No DB query should have been made
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 404 when the comment does not exist', async () => {
    // Arrange – DB returns empty rows (comment not found)
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req: any = {
      headers: { 'x-user-id': 'user-1' },
      body: { content: 'updated text' },
      params: { id: '999' },
    };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Comment not found' }),
    );
  });

  it('returns 403 when a different user tries to edit the comment', async () => {
    // Arrange – DB returns a comment owned by 'author-user'
    const mockPool = makeMockPool(async () => ({ rows: [{ user_id: 'author-user' }] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req: any = {
      headers: { 'x-user-id': 'attacker-user' }, // different user
      body: { content: 'malicious edit' },
      params: { id: '7' },
    };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, message: 'You can only edit your own comments' }),
    );
  });

  it('returns 400 when content is missing after ownership passes', async () => {
    // Arrange – the user IS the author; content is blank
    const mockPool = makeMockPool(async () => ({ rows: [{ user_id: 'owner-user' }] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req: any = {
      headers: { 'x-user-id': 'owner-user' },
      body: { content: '' },
      params: { id: '7' },
    };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Comment content is required' }),
    );
  });
});

describe('comments route – DELETE /comments/:id (ownership enforcement)', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req: any = { headers: {}, params: { id: '1' } };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 404 when the comment does not exist', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req: any = {
      headers: { 'x-user-id': 'user-1' },
      params: { id: '999' },
    };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Comment not found' }),
    );
  });

  it('returns 403 when a different user tries to delete the comment', async () => {
    // Arrange – comment owned by 'real-author'
    const mockPool = makeMockPool(async () => ({ rows: [{ user_id: 'real-author' }] }));
    const router = await loadCommentsRouter(mockPool);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req: any = {
      headers: { 'x-user-id': 'attacker' }, // not the author
      params: { id: '5' },
    };
    const res: any = {};
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, message: 'You can only delete your own comments' }),
    );
  });
});
