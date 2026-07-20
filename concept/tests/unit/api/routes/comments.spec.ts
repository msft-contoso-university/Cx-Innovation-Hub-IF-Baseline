/**
 * Unit tests for concept/apps/api/src/routes/comments.js
 *
 * Covers the highest-risk paths:
 *   - POST /tasks/:taskId/comments — missing X-User-Id header (400)
 *   - POST /tasks/:taskId/comments — missing content (400)
 *   - PUT  /comments/:id — missing X-User-Id header (400)
 *   - PUT  /comments/:id — non-owner attempt to edit (403)  ← authorization boundary
 *   - PUT  /comments/:id — 404 when comment does not exist
 *   - PUT  /comments/:id — missing content (400)
 *   - DELETE /comments/:id — missing X-User-Id header (400)
 *   - DELETE /comments/:id — non-owner attempt to delete (403) ← authorization boundary
 *   - DELETE /comments/:id — 404 when comment does not exist
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');

// ─── helpers ──────────────────────────────────────────────────────────────────

async function loadCommentsRouter(mockGetPool: () => { query: ReturnType<typeof vi.fn> }) {
  delete require.cache[commentsRoutePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    if (request === '../middleware/errorHandler') {
      return originalLoad(
        require.resolve('../../../../apps/api/src/middleware/errorHandler.js'),
        parent,
        isMain,
      );
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsRoutePath);
}

function routerRequest(
  router: { handle: Function },
  method: string,
  url: string,
  opts: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number | null; body: unknown; nextErr: unknown }> {
  return new Promise((resolve) => {
    let capturedStatus: number | null = null;
    let capturedBody: unknown = null;

    const req: Record<string, unknown> = {
      method,
      url,
      path: url,
      headers: opts.headers ?? {},
      body: opts.body ?? {},
      params: {},
    };
    const res = {
      status: vi.fn().mockImplementation((s: number) => { capturedStatus = s; return res; }),
      json: vi.fn().mockImplementation((b: unknown) => {
        capturedBody = b;
        resolve({ status: capturedStatus, body: capturedBody, nextErr: null });
      }),
    };
    const next = vi.fn().mockImplementation((err?: unknown) => {
      resolve({ status: capturedStatus, body: capturedBody, nextErr: err });
    });

    router.handle(req, res, next);
  });
}

// ─── POST /tasks/:taskId/comments ─────────────────────────────────────────────

describe('POST /tasks/:taskId/comments — input validation', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'POST', '/tasks/task-1/comments', {
      body: { content: 'Hello' },
      headers: {},
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/x-user-id.*required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('calls next with 400 when content is absent', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'POST', '/tasks/task-1/comments', {
      body: {},
      headers: { 'x-user-id': 'user-1' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content is required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('calls next with 400 when content is blank whitespace', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'POST', '/tasks/task-1/comments', {
      body: { content: '   ' },
      headers: { 'x-user-id': 'user-1' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content is required/i);
  });
});

// ─── PUT /comments/:id — authorization ────────────────────────────────────────

describe('PUT /comments/:id — authorization', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('calls next with 403 when a different user attempts to edit the comment', async () => {
    // Arrange — comment owned by "user-A", request from "user-B"
    const mockQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ user_id: 'user-A' }],
    });
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'PUT', '/comments/comment-1', {
      body: { content: 'Hijacked content' },
      headers: { 'x-user-id': 'user-B' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/only edit your own/i);
    // Only the ownership SELECT should have fired, not the UPDATE
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'PUT', '/comments/comment-1', {
      body: { content: 'Hello' },
      headers: {},
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/x-user-id.*required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('calls next with 404 when the comment does not exist', async () => {
    // Arrange
    const mockQuery = vi.fn().mockResolvedValueOnce({ rows: [] });
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'PUT', '/comments/nonexistent', {
      body: { content: 'Hello' },
      headers: { 'x-user-id': 'user-1' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/comment not found/i);
  });

  it('calls next with 400 when content is absent but user owns the comment', async () => {
    // Arrange — ownership check passes (same user)
    const mockQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ user_id: 'user-1' }],
    });
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'PUT', '/comments/comment-1', {
      body: {},
      headers: { 'x-user-id': 'user-1' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content is required/i);
    expect(mockQuery).toHaveBeenCalledTimes(1); // only ownership check, not UPDATE
  });
});

// ─── DELETE /comments/:id — authorization ─────────────────────────────────────

describe('DELETE /comments/:id — authorization', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('calls next with 403 when a different user attempts to delete the comment', async () => {
    // Arrange — comment owned by "user-A", request from "user-C"
    const mockQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ user_id: 'user-A' }],
    });
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'DELETE', '/comments/comment-2', {
      headers: { 'x-user-id': 'user-C' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/only delete your own/i);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('calls next with 400 when X-User-Id header is missing', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'DELETE', '/comments/comment-2', {
      headers: {},
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/x-user-id.*required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('calls next with 404 when the comment does not exist', async () => {
    // Arrange
    const mockQuery = vi.fn().mockResolvedValueOnce({ rows: [] });
    const router = await loadCommentsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'DELETE', '/comments/nonexistent', {
      headers: { 'x-user-id': 'user-1' },
    });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/comment not found/i);
  });
});
