/**
 * Unit tests for the comments route handlers.
 *
 * The highest-risk logic here is the author-ownership gate on PUT and DELETE:
 * only the user who created a comment (matched via X-User-Id header) may
 * edit or delete it.  These tests verify the 400/403/404 gates end-to-end.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const dir = dirname(fileURLToPath(import.meta.url));
const commentsRouterPath = resolve(dir, '../../../../apps/api/src/routes/comments.js');

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

let handlers: Record<string, Function> = {};

function createMockRouter() {
  const router: any = {};
  handlers = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    router[method] = (path: string, handler: Function) => {
      handlers[`${method.toUpperCase()} ${path}`] = handler;
      return router;
    };
  }
  return router;
}

function loadRouter() {
  delete require.cache[commentsRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return { Router: createMockRouter };
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  require(commentsRouterPath);
}

beforeEach(() => {
  vi.clearAllMocks();
  loadRouter();
});

afterEach(() => {
  Module._load = originalLoad;
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:taskId/comments
// ---------------------------------------------------------------------------
describe('POST /api/tasks/:taskId/comments', () => {
  it('calls next with 400 when X-User-Id header is absent', async () => {
    // Arrange
    const req = { body: { content: 'Hello' }, params: { taskId: 'task-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /tasks/:taskId/comments']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
  });

  it('calls next with 400 when content is missing', async () => {
    // Arrange
    const req = { body: {}, params: { taskId: 'task-1' }, headers: { 'x-user-id': 'user-1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /tasks/:taskId/comments']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Comment content is required' });
  });

  it('calls next with 400 when content is whitespace-only', async () => {
    // Arrange
    const req = { body: { content: '   ' }, params: { taskId: 'task-1' }, headers: { 'x-user-id': 'user-1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /tasks/:taskId/comments']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
  });

  it('responds 201 with the created comment on success', async () => {
    // Arrange
    const insertedRow = { id: 'c-1', task_id: 'task-1', user_id: 'user-1', content: 'Hello' };
    const commentWithAuthor = { ...insertedRow, author_name: 'Alice', author_avatar_color: 'blue' };
    mockQuery
      .mockResolvedValueOnce({ rows: [insertedRow] })
      .mockResolvedValueOnce({ rows: [commentWithAuthor] });

    const req = {
      body: { content: 'Hello' },
      params: { taskId: 'task-1' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /tasks/:taskId/comments']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(commentWithAuthor);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/comments/:id  (author-only edit)
// ---------------------------------------------------------------------------
describe('PUT /api/comments/:id', () => {
  it('calls next with 400 when X-User-Id header is absent', async () => {
    // Arrange
    const req = { body: { content: 'Edited' }, params: { id: 'c-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
  });

  it('calls next with 404 when the comment does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { body: { content: 'Edited' }, params: { id: 'missing' }, headers: { 'x-user-id': 'user-1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Comment not found' });
  });

  it('calls next with 403 when the requester is not the comment author', async () => {
    // Arrange – comment owned by user-1, but request comes from user-2
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
    const req = {
      body: { content: 'Edited' },
      params: { id: 'c-1' },
      headers: { 'x-user-id': 'user-2' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 403,
      message: 'You can only edit your own comments',
    });
  });

  it('calls next with 400 when content is empty and requester is the author', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
    const req = {
      body: { content: '' },
      params: { id: 'c-1' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Comment content is required' });
  });

  it('responds with the updated comment when the author edits their own comment', async () => {
    // Arrange
    const updatedRow = { id: 'c-1', content: 'Edited text' };
    const commentWithAuthor = { ...updatedRow, author_name: 'Alice' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [updatedRow] })             // UPDATE
      .mockResolvedValueOnce({ rows: [commentWithAuthor] });     // JOIN SELECT

    const req = {
      body: { content: 'Edited text' },
      params: { id: 'c-1' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(commentWithAuthor);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/comments/:id  (author-only delete)
// ---------------------------------------------------------------------------
describe('DELETE /api/comments/:id', () => {
  it('calls next with 400 when X-User-Id header is absent', async () => {
    // Arrange
    const req = { body: {}, params: { id: 'c-1' }, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['DELETE /comments/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'X-User-Id header is required' });
  });

  it('calls next with 404 when the comment does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { body: {}, params: { id: 'missing' }, headers: { 'x-user-id': 'user-1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['DELETE /comments/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Comment not found' });
  });

  it('calls next with 403 when the requester is not the comment author', async () => {
    // Arrange – comment owned by user-1, request from user-2
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
    const req = {
      body: {},
      params: { id: 'c-1' },
      headers: { 'x-user-id': 'user-2' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['DELETE /comments/:id']!(req, res, next);

    // Assert
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 403,
      message: 'You can only delete your own comments',
    });
  });

  it('responds with a success message when the author deletes their own comment', async () => {
    // Arrange
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [] });                      // DELETE

    const req = {
      body: {},
      params: { id: 'c-1' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['DELETE /comments/:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'c-1' });
  });
});
