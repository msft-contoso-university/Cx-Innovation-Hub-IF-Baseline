import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');

const mockQuery = vi.fn();

type MockRequest = {
  params: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string | undefined>;
};

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

function createMockRes(): MockResponse {
  const res: Partial<MockResponse> = {
    statusCode: 200,
  };
  res.status = function status(code: number) {
    res.statusCode = code;
    return res as MockResponse;
  };
  res.json = function json(payload: unknown) {
    res.body = payload;
    return res as MockResponse;
  };
  return res as MockResponse;
}

function loadCommentsRouter() {
  delete require.cache[commentsModulePath];

  Module._load = (request: string, parent: { filename?: string } | null, isMain: boolean) => {
    if (request === '../services/database' && parent?.filename === commentsModulePath) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(commentsModulePath);
}

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) {
    throw new Error(`No route found for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

async function invoke(handler: any, req: MockRequest) {
  const res = createMockRes();
  const next = vi.fn();
  await handler(req, res, next);
  return { res, next };
}

describe('comments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('PUT /comments/:id', () => {
    it('updates the comment when the requester is the author (happy path)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [{ id: '5' }] }) // update
        .mockResolvedValueOnce({ rows: [{ id: '5', content: 'Updated text' }] }); // re-fetch with author

      const req: MockRequest = {
        params: { id: '5' },
        body: { content: 'Updated text' },
        headers: { 'x-user-id': 'user-1' },
      };

      // Act
      const { res, next } = await invoke(handler, req);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: '5', content: 'Updated text' });
    });

    it('returns 400 when the X-User-Id header is missing (invalid input)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      const req: MockRequest = {
        params: { id: '5' },
        body: { content: 'Updated text' },
        headers: {},
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      expect(mockQuery).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('X-User-Id header is required');
    });

    it('returns 404 when the comment does not exist (boundary condition)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req: MockRequest = {
        params: { id: 'missing' },
        body: { content: 'Updated text' },
        headers: { 'x-user-id': 'user-1' },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toBe('Comment not found');
    });

    it('returns 403 when the requester is not the comment author (authorization)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

      const req: MockRequest = {
        params: { id: '5' },
        body: { content: 'Trying to edit someone else comment' },
        headers: { 'x-user-id': 'user-2' },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toBe('You can only edit your own comments');
    });

    it('returns 400 when content is empty (invalid input)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'put', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

      const req: MockRequest = {
        params: { id: '5' },
        body: { content: '   ' },
        headers: { 'x-user-id': 'user-1' },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('Comment content is required');
    });
  });

  describe('DELETE /comments/:id', () => {
    it('deletes the comment when the requester is the author (happy path)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'delete', '/comments/:id');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const req: MockRequest = {
        params: { id: '5' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      };

      // Act
      const { res, next } = await invoke(handler, req);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ message: 'Comment deleted', id: '5' });
    });

    it('returns 403 when the requester is not the comment author (authorization)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'delete', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

      const req: MockRequest = {
        params: { id: '5' },
        body: {},
        headers: { 'x-user-id': 'user-2' },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(403);
      expect(err.message).toBe('You can only delete your own comments');
    });

    it('returns 404 when the comment does not exist (boundary condition)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'delete', '/comments/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req: MockRequest = {
        params: { id: 'missing' },
        body: {},
        headers: { 'x-user-id': 'user-1' },
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toBe('Comment not found');
    });

    it('returns 400 when the X-User-Id header is missing (invalid input)', async () => {
      // Arrange
      const router = loadCommentsRouter();
      const handler = getHandler(router, 'delete', '/comments/:id');
      const req: MockRequest = {
        params: { id: '5' },
        body: {},
        headers: {},
      };

      // Act
      const { next } = await invoke(handler, req);

      // Assert
      expect(mockQuery).not.toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('X-User-Id header is required');
    });
  });
});
