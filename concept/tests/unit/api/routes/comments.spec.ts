import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockPool(queryImpl: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { query: vi.fn(queryImpl) };
}

function buildResMock() {
  const res: {
    statusCode?: number;
    body?: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => typeof res;
  } = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

function buildNextMock() {
  return vi.fn();
}

// ---------------------------------------------------------------------------
// Module loader with injectable pool
// ---------------------------------------------------------------------------

const commentsPath = require.resolve('../../../../apps/api/src/routes/comments.js');
const dbPath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// Minimal express Router stub that captures registered routes so we can
// invoke individual handlers without a running server.
function buildExpressStub() {
  const routes: { method: string; path: string; handle: Function }[] = [];
  const stack = routes.map((r) => ({ route: r })); // filled as routes register

  const router: Record<string, unknown> & { stack: typeof routes } = { stack: routes };

  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (path: string, handler: Function) => {
      routes.push({ method, path, handle: handler });
      return router;
    };
  }

  const Router = () => router;
  return { Router, router };
}

function loadCommentsRouter(pool: ReturnType<typeof buildMockPool>) {
  delete require.cache[commentsPath];

  const { Router, router } = buildExpressStub();

  // Load the real errorHandler so createError works correctly.
  const realErrorHandler = originalLoad(errorHandlerPath, null, false);

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router };
    }
    if (request === '../services/database') {
      return { getPool: () => pool };
    }
    if (request === '../middleware/errorHandler') {
      return realErrorHandler;
    }
    return originalLoad(request, parent, isMain);
  };

  require(commentsPath);
  return router;
}

// Invoke a specific route handler by matching method + path pattern.
function findHandler(router: { stack: { method: string; path: string; handle: Function }[] }, method: string, pathPattern: string) {
  for (const layer of router.stack) {
    if (layer.path === pathPattern && layer.method === method.toLowerCase()) {
      return layer.handle as (req: unknown, res: unknown, next: unknown) => void;
    }
  }
  throw new Error(`No handler found for ${method} ${pathPattern}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('comments route — PUT /comments/:id (authorization)', () => {
  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[commentsPath];
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const pool = buildMockPool(async () => ({ rows: [] }));
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req = { headers: {}, params: { id: '1' }, body: { content: 'hello' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/i);
  });

  it('returns 404 when the comment does not exist', async () => {
    // Arrange
    const pool = buildMockPool(async () => ({ rows: [] }));
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req = { headers: { 'x-user-id': '42' }, params: { id: '999' }, body: { content: 'hello' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(404);
  });

  it('returns 403 when the caller is not the comment author', async () => {
    // Arrange
    const pool = buildMockPool(async () => ({ rows: [{ user_id: '10' }] }));
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'put', '/comments/:id');

    // Caller is user 99, but comment belongs to user 10
    const req = { headers: { 'x-user-id': '99' }, params: { id: '5' }, body: { content: 'sneaky edit' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(403);
  });

  it('returns 400 when content is blank', async () => {
    // Arrange
    // First query returns the comment (ownership matches), second is the update
    let callCount = 0;
    const pool = buildMockPool(async () => {
      callCount++;
      if (callCount === 1) return { rows: [{ user_id: '7' }] }; // ownership check
      return { rows: [] };
    });
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'put', '/comments/:id');

    const req = { headers: { 'x-user-id': '7' }, params: { id: '3' }, body: { content: '   ' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });
});

describe('comments route — DELETE /comments/:id (authorization)', () => {
  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[commentsPath];
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const pool = buildMockPool(async () => ({ rows: [] }));
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req = { headers: {}, params: { id: '1' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });

  it('returns 404 when the comment does not exist', async () => {
    // Arrange
    const pool = buildMockPool(async () => ({ rows: [] }));
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req = { headers: { 'x-user-id': '1' }, params: { id: '999' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(404);
  });

  it('returns 403 when the caller is not the comment author', async () => {
    // Arrange
    const pool = buildMockPool(async () => ({ rows: [{ user_id: '10' }] }));
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req = { headers: { 'x-user-id': '99' }, params: { id: '5' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(403);
  });

  it('resolves successfully when the caller owns the comment', async () => {
    // Arrange
    let callCount = 0;
    const pool = buildMockPool(async () => {
      callCount++;
      if (callCount === 1) return { rows: [{ user_id: '7' }] }; // ownership check
      return { rows: [] }; // delete
    });
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'delete', '/comments/:id');

    const req = { headers: { 'x-user-id': '7' }, params: { id: '3' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert — next should not have been called with an error
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ message: 'Comment deleted' });
  });
});

describe('comments route — POST /tasks/:taskId/comments (validation)', () => {
  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[commentsPath];
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const pool = buildMockPool(async () => ({ rows: [] }));
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req = { headers: {}, params: { taskId: '1' }, body: { content: 'hello' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });

  it('returns 400 when content is empty', async () => {
    // Arrange
    const pool = buildMockPool(async () => ({ rows: [] }));
    const router = loadCommentsRouter(pool);
    const handler = findHandler(router, 'post', '/tasks/:taskId/comments');

    const req = { headers: { 'x-user-id': '1' }, params: { taskId: '1' }, body: { content: '' } };
    const res = buildResMock();
    const next = buildNextMock();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });
});
