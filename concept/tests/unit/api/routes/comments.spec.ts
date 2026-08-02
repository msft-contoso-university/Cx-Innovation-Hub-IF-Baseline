import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const commentsRoutePath = require.resolve('../../../../apps/api/src/routes/comments.js');

const mockQuery = vi.fn();

function createExpressMock() {
  function Router() {
    const stack: any[] = [];
    const addRoute = (method: string) => (path: string, handler: Function) => {
      const existing = stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
      if (existing) {
        existing.route.stack.push({ handle: handler });
      } else {
        stack.push({ route: { path, methods: { [method]: true }, stack: [{ handle: handler }] } });
      }
    };
    const r: any = { stack, get: addRoute('get'), post: addRoute('post'), put: addRoute('put'), patch: addRoute('patch'), delete: addRoute('delete') };
    return r;
  }
  return { Router };
}

async function loadCommentsRouter() {
  delete require.cache[commentsRoutePath];
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return createExpressMock();
    if (request === '../services/database' || request.endsWith('services/database.js')) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };
  return require(commentsRoutePath);
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnThis();
  return { json, status } as any;
}

function findHandler(router: any, method: string, pathMatch: string) {
  return router.stack.find(
    (l: any) => l.route?.methods?.[method] && l.route?.path?.includes(pathMatch)
  )?.route?.stack[0]?.handle;
}

describe('POST /api/tasks/:taskId/comments', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'post', 'comments');
    const next = vi.fn();

    // Act
    await handler({ params: { taskId: 't-1' }, headers: {}, body: { content: 'Hi' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'X-User-Id header is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 400 when content is missing', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'post', 'comments');
    const next = vi.fn();

    // Act
    await handler(
      { params: { taskId: 't-1' }, headers: { 'x-user-id': 'u-1' }, body: {} },
      makeRes(),
      next
    );

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Comment content is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 400 when content is whitespace only', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'post', 'comments');
    const next = vi.fn();

    // Act
    await handler(
      { params: { taskId: 't-1' }, headers: { 'x-user-id': 'u-1' }, body: { content: '   ' } },
      makeRes(),
      next
    );

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Comment content is required' }));
  });

  it('creates a comment and returns 201 on success', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'post', 'comments');
    const next = vi.fn();
    const res = makeRes();
    const newComment = { id: 'c-1', content: 'Great work!', author_name: 'Alice' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] })
      .mockResolvedValueOnce({ rows: [newComment] });

    // Act
    await handler(
      { params: { taskId: 't-1' }, headers: { 'x-user-id': 'u-1' }, body: { content: 'Great work!' } },
      res,
      next
    );

    // Assert
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newComment);
  });
});

describe('PUT /api/comments/:id', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    const next = vi.fn();

    // Act
    await handler({ params: { id: 'c-1' }, headers: {}, body: { content: 'Updated' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'X-User-Id header is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    await handler(
      { params: { id: 'missing' }, headers: { 'x-user-id': 'u-1' }, body: { content: 'Updated' } },
      makeRes(),
      next
    );

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Comment not found' }));
    expect((next.mock.calls[0][0] as any).status).toBe(404);
  });

  it('returns 403 when user is not the comment author', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-id' }] });

    // Act
    await handler(
      { params: { id: 'c-1' }, headers: { 'x-user-id': 'different-user' }, body: { content: 'Edited' } },
      makeRes(),
      next
    );

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You can only edit your own comments' })
    );
    expect((next.mock.calls[0][0] as any).status).toBe(403);
  });

  it('returns 400 when content is empty after ownership check', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u-1' }] });

    // Act
    await handler(
      { params: { id: 'c-1' }, headers: { 'x-user-id': 'u-1' }, body: { content: '' } },
      makeRes(),
      next
    );

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Comment content is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('updates the comment and returns the updated row when authorized', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'put', '/comments/:id');
    const next = vi.fn();
    const res = makeRes();
    const updatedComment = { id: 'c-1', content: 'Fixed', author_name: 'Alice' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'u-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] })
      .mockResolvedValueOnce({ rows: [updatedComment] });

    // Act
    await handler(
      { params: { id: 'c-1' }, headers: { 'x-user-id': 'u-1' }, body: { content: 'Fixed' } },
      res,
      next
    );

    // Assert
    expect(res.json).toHaveBeenCalledWith(updatedComment);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/comments/:id', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    const next = vi.fn();

    // Act
    await handler({ params: { id: 'c-1' }, headers: {}, body: {} }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'X-User-Id header is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    await handler({ params: { id: 'missing' }, headers: { 'x-user-id': 'u-1' }, body: {} }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Comment not found' }));
    expect((next.mock.calls[0][0] as any).status).toBe(404);
  });

  it('returns 403 when user is not the comment author', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-id' }] });

    // Act
    await handler(
      { params: { id: 'c-1' }, headers: { 'x-user-id': 'attacker' }, body: {} },
      makeRes(),
      next
    );

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You can only delete your own comments' })
    );
    expect((next.mock.calls[0][0] as any).status).toBe(403);
  });

  it('deletes the comment and returns success message when authorized', async () => {
    // Arrange
    const router = await loadCommentsRouter();
    const handler = findHandler(router, 'delete', '/comments/:id');
    const next = vi.fn();
    const res = makeRes();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'u-1' }] })
      .mockResolvedValueOnce({});

    // Act
    await handler({ params: { id: 'c-1' }, headers: { 'x-user-id': 'u-1' }, body: {} }, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'c-1' });
    expect(next).not.toHaveBeenCalled();
  });
});
