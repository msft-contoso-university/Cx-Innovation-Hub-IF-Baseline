/**
 * Unit tests for the comments router.
 *
 * Key behaviours verified:
 *  - GET /tasks/:taskId/comments  — returns 200 with comment rows
 *  - POST /tasks/:taskId/comments — validates X-User-Id header and content
 *  - PUT  /comments/:id           — validates header, ownership (403), content
 *  - DELETE /comments/:id         — validates header, ownership (403), 404
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let mockQuery: ReturnType<typeof vi.fn>;

function setupMocks() {
  mockQuery = vi.fn();
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database' || request.endsWith('/services/database.js')) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    if (request === '../middleware/errorHandler' || request.endsWith('/middleware/errorHandler.js')) {
      return originalLoad(request, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };
}

function buildRouter() {
  const commentsPath = require.resolve('../../../../apps/api/src/routes/comments.js');
  delete require.cache[commentsPath];
  return require(commentsPath);
}

// ---------------------------------------------------------------------------
// Express test harness (lightweight, no real server)
// ---------------------------------------------------------------------------

function buildMockRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 200;
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildMockReq(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return { params, body, headers };
}

async function callRoute(
  router: ReturnType<typeof buildRouter>,
  method: string,
  path: string,
  req: ReturnType<typeof buildMockReq>,
) {
  const res = buildMockRes();
  const next = vi.fn();

  await new Promise<void>((resolve) => {
    // Find the matching layer in the Express router stack
    const layers: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> =
      router.stack;

    for (const layer of layers) {
      if (!layer.route) continue;
      if (!layer.route.methods[method.toLowerCase()]) continue;

      // Normalise param names so /:taskId and /:id match
      const routePath = layer.route.path.replace(/:[a-zA-Z_]+/g, ':param');
      const reqPath = path.replace(/[^/]+/g, (seg, offset, str) => {
        // Replace non-slash segments that correspond to param positions
        return seg;
      });

      // Simple path matching: count segments and compare shapes
      const routeSegs = layer.route.path.split('/');
      const reqSegs = path.split('/');
      if (routeSegs.length !== reqSegs.length) continue;

      const matches = routeSegs.every((seg, i) => seg.startsWith(':') || seg === reqSegs[i]);
      if (!matches) continue;

      // Extract params
      routeSegs.forEach((seg, i) => {
        if (seg.startsWith(':')) req.params[seg.slice(1)] = reqSegs[i];
      });

      layer.route.stack[0].handle(req, res, next).then ? layer.route.stack[0].handle(req, res, next).then(resolve).catch(resolve) : resolve();
      return;
    }
    resolve();
  });

  return { res, next };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  setupMocks();
});

afterEach(() => {
  Module._load = originalLoad;
  vi.clearAllMocks();
});

describe('GET /tasks/:taskId/comments', () => {
  it('returns 200 with comment rows from the database', async () => {
    // Arrange
    const router = buildRouter();
    const fakeComments = [{ id: 'c1', content: 'Hello', author_name: 'Alice' }];
    mockQuery.mockResolvedValue({ rows: fakeComments });
    const req = buildMockReq({ taskId: 'task-1' });

    // Act
    const { res, next } = await callRoute(router, 'GET', '/tasks/task-1/comments', req);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(fakeComments);
  });

  it('passes database errors to next()', async () => {
    // Arrange
    const router = buildRouter();
    const dbError = new Error('DB failure');
    mockQuery.mockRejectedValue(dbError);
    const req = buildMockReq({ taskId: 'task-1' });

    // Act
    const { next } = await callRoute(router, 'GET', '/tasks/task-1/comments', req);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});

describe('POST /tasks/:taskId/comments', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = buildRouter();
    const req = buildMockReq({ taskId: 'task-1' }, { content: 'A comment' }, {});
    const res = buildMockRes();
    const next = vi.fn();

    // Find and call the POST handler directly
    const postLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route?.methods?.post,
    );
    await postLayer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/X-User-Id/);
  });

  it('returns 400 when content is empty', async () => {
    // Arrange
    const router = buildRouter();
    const req = buildMockReq(
      { taskId: 'task-1' },
      { content: '   ' },
      { 'x-user-id': 'user-abc' },
    );
    const next = vi.fn();
    const res = buildMockRes();

    const postLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route?.methods?.post,
    );
    await postLayer.route.stack[0].handle(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/content/i);
  });

  it('returns 201 with created comment on success', async () => {
    // Arrange
    const router = buildRouter();
    const insertedComment = { id: 'c2', content: 'Nice work', author_name: 'Bob' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c2' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [insertedComment] }); // SELECT with JOIN

    const req = buildMockReq(
      { taskId: 'task-1' },
      { content: 'Nice work' },
      { 'x-user-id': 'user-bob' },
    );
    const res = buildMockRes();
    const next = vi.fn();

    const postLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/tasks/:taskId/comments' && l.route?.methods?.post,
    );
    await postLayer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(insertedComment);
  });
});

describe('PUT /comments/:id', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = buildRouter();
    const req = buildMockReq({ id: 'c1' }, { content: 'Updated' }, {});
    const res = buildMockRes();
    const next = vi.fn();

    const putLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.put,
    );
    await putLayer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [] });
    const req = buildMockReq({ id: 'c-missing' }, { content: 'Updated' }, { 'x-user-id': 'user-1' });
    const res = buildMockRes();
    const next = vi.fn();

    const putLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.put,
    );
    await putLayer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('returns 403 when a different user tries to edit the comment', async () => {
    // Arrange
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'owner-user' }] });
    const req = buildMockReq(
      { id: 'c1' },
      { content: 'Sneaky edit' },
      { 'x-user-id': 'different-user' },
    );
    const res = buildMockRes();
    const next = vi.fn();

    const putLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.put,
    );
    await putLayer.route.stack[0].handle(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('returns 400 when content is blank after ownership check passes', async () => {
    // Arrange
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
    const req = buildMockReq(
      { id: 'c1' },
      { content: '' },
      { 'x-user-id': 'user-1' },
    );
    const res = buildMockRes();
    const next = vi.fn();

    const putLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.put,
    );
    await putLayer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('returns 200 with updated comment when author edits successfully', async () => {
    // Arrange
    const router = buildRouter();
    const updatedComment = { id: 'c1', content: 'Corrected', author_name: 'Alice' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })          // UPDATE
      .mockResolvedValueOnce({ rows: [updatedComment] });         // SELECT with JOIN

    const req = buildMockReq(
      { id: 'c1' },
      { content: 'Corrected' },
      { 'x-user-id': 'user-1' },
    );
    const res = buildMockRes();
    const next = vi.fn();

    const putLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.put,
    );
    await putLayer.route.stack[0].handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(updatedComment);
  });
});

describe('DELETE /comments/:id', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const router = buildRouter();
    const req = buildMockReq({ id: 'c1' }, {}, {});
    const res = buildMockRes();
    const next = vi.fn();

    const deleteLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.delete,
    );
    await deleteLayer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [] });
    const req = buildMockReq({ id: 'c-missing' }, {}, { 'x-user-id': 'user-1' });
    const res = buildMockRes();
    const next = vi.fn();

    const deleteLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.delete,
    );
    await deleteLayer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('returns 403 when a different user tries to delete the comment', async () => {
    // Arrange
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'owner-user' }] });
    const req = buildMockReq({ id: 'c1' }, {}, { 'x-user-id': 'intruder' });
    const res = buildMockRes();
    const next = vi.fn();

    const deleteLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.delete,
    );
    await deleteLayer.route.stack[0].handle(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/own/i);
  });

  it('returns 200 with confirmation message when author deletes successfully', async () => {
    // Arrange
    const router = buildRouter();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [] });                      // DELETE

    const req = buildMockReq({ id: 'c1' }, {}, { 'x-user-id': 'user-1' });
    const res = buildMockRes();
    const next = vi.fn();

    const deleteLayer = router.stack.find(
      (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
        l.route?.path === '/comments/:id' && l.route?.methods?.delete,
    );
    await deleteLayer.route.stack[0].handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Comment deleted' }),
    );
  });
});
