import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');

// Captured route handlers
const handlers: Record<string, (...args: any[]) => Promise<void>> = {};

let mockPool: { query: ReturnType<typeof vi.fn> };

function makeRouterStub() {
  const stub: any = {
    get: (path: string, fn: (...a: any[]) => any) => { handlers[`GET ${path}`] = fn; return stub; },
    post: (path: string, fn: (...a: any[]) => any) => { handlers[`POST ${path}`] = fn; return stub; },
    put: (path: string, fn: (...a: any[]) => any) => { handlers[`PUT ${path}`] = fn; return stub; },
    patch: (path: string, fn: (...a: any[]) => any) => { handlers[`PATCH ${path}`] = fn; return stub; },
    delete: (path: string, fn: (...a: any[]) => any) => { handlers[`DELETE ${path}`] = fn; return stub; },
  };
  return stub;
}

beforeAll(() => {
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return { Router: makeRouterStub };
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[commentsRoutePath];
  require(commentsRoutePath);

  Module._load = originalLoad;
});

afterAll(() => {
  Module._load = originalLoad;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPool = { query: vi.fn() };
});

function makeRes() {
  const res: any = { status: vi.fn(() => res), json: vi.fn() };
  return res;
}

// ---------------------------------------------------------------------------
// GET /tasks/:taskId/comments
// ---------------------------------------------------------------------------
describe('GET /tasks/:taskId/comments', () => {
  it('returns comments for a task', async () => {
    // Arrange
    const rows = [{ id: 'c1', content: 'Hello', author_name: 'Alice' }];
    mockPool.query = vi.fn().mockResolvedValue({ rows });
    const req: any = { params: { taskId: 'task-1' }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['GET /tasks/:taskId/comments']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(rows);
  });
});

// ---------------------------------------------------------------------------
// POST /tasks/:taskId/comments
// ---------------------------------------------------------------------------
describe('POST /tasks/:taskId/comments', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const req: any = { params: { taskId: 'task-1' }, body: { content: 'Hi' }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /tasks/:taskId/comments']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/x-user-id/i);
  });

  it('returns 400 when content is missing', async () => {
    // Arrange
    const req: any = { params: { taskId: 'task-1' }, body: {}, headers: { 'x-user-id': 'user-1' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /tasks/:taskId/comments']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content is required/i);
  });

  it('returns 400 when content is whitespace only', async () => {
    // Arrange
    const req: any = {
      params: { taskId: 'task-1' },
      body: { content: '   ' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /tasks/:taskId/comments']!(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('creates a comment and returns 201', async () => {
    // Arrange
    const comment = { id: 'cmt-1', content: 'LGTM', author_name: 'Alice' };
    mockPool.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'cmt-1' }] })  // INSERT
      .mockResolvedValueOnce({ rows: [comment] });          // SELECT with join
    const req: any = {
      params: { taskId: 'task-1' },
      body: { content: 'LGTM' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /tasks/:taskId/comments']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(comment);
  });
});

// ---------------------------------------------------------------------------
// PUT /comments/:id  (edit — owner only)
// ---------------------------------------------------------------------------
describe('PUT /comments/:id', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const req: any = { params: { id: 'cmt-1' }, body: { content: 'Updated' }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/x-user-id/i);
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [] });
    const req: any = {
      params: { id: 'missing' },
      body: { content: 'Updated' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/comment not found/i);
  });

  it('returns 403 when requesting user is not the comment author', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'owner-user' }] });
    const req: any = {
      params: { id: 'cmt-1' },
      body: { content: 'Hacked' },
      headers: { 'x-user-id': 'different-user' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('returns 400 when content is empty', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
    const req: any = {
      params: { id: 'cmt-1' },
      body: { content: '' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content is required/i);
  });

  it('updates the comment when user is the author', async () => {
    // Arrange
    const updated = { id: 'cmt-1', content: 'Updated', author_name: 'Alice' };
    mockPool.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })   // ownership check
      .mockResolvedValueOnce({ rows: [{ id: 'cmt-1' }] })         // UPDATE
      .mockResolvedValueOnce({ rows: [updated] });                 // SELECT with join
    const req: any = {
      params: { id: 'cmt-1' },
      body: { content: 'Updated' },
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['PUT /comments/:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(updated);
  });
});

// ---------------------------------------------------------------------------
// DELETE /comments/:id  (delete — owner only)
// ---------------------------------------------------------------------------
describe('DELETE /comments/:id', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const req: any = { params: { id: 'cmt-1' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['DELETE /comments/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [] });
    const req: any = { params: { id: 'missing' }, body: {}, headers: { 'x-user-id': 'user-1' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['DELETE /comments/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('returns 403 when requesting user is not the comment author', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'owner-user' }] });
    const req: any = {
      params: { id: 'cmt-1' },
      body: {},
      headers: { 'x-user-id': 'attacker' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['DELETE /comments/:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('deletes the comment and returns confirmation when user is the author', async () => {
    // Arrange
    mockPool.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })  // ownership check
      .mockResolvedValueOnce({ rows: [] });                       // DELETE
    const req: any = {
      params: { id: 'cmt-1' },
      body: {},
      headers: { 'x-user-id': 'user-1' },
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['DELETE /comments/:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'cmt-1' });
  });
});
