import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsRouterPath = require.resolve('../../../../apps/api/src/routes/comments.js');
const databasePath = require.resolve('../../../../apps/api/src/services/database.js');

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
const mockDatabase = { getPool: () => mockPool };

interface RouterHandlers {
  [key: string]: (req: any, res: any, next: any) => Promise<void>;
}

interface MockRouter extends RouterHandlers {
  get: (path: string, handler: Function) => void;
  post: (path: string, handler: Function) => void;
  put: (path: string, handler: Function) => void;
  delete: (path: string, handler: Function) => void;
}

let mockRouter: MockRouter;

function createMockRouter(): MockRouter {
  const handlers: RouterHandlers = {};
  const router = handlers as MockRouter;
  router.get = (path: string, handler: Function) => { handlers[`GET:${path}`] = handler as any; };
  router.post = (path: string, handler: Function) => { handlers[`POST:${path}`] = handler as any; };
  router.put = (path: string, handler: Function) => { handlers[`PUT:${path}`] = handler as any; };
  router.delete = (path: string, handler: Function) => { handlers[`DELETE:${path}`] = handler as any; };
  return router;
}

function makeMocks(overrides: { body?: object; params?: object; headers?: object } = {}) {
  const req = {
    body: overrides.body ?? {},
    params: overrides.params ?? {},
    headers: overrides.headers ?? {},
  } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  return { req, res, next };
}

function loadRouter() {
  mockRouter = createMockRouter();
  delete require.cache[commentsRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databasePath) {
        return mockDatabase;
      }
    } catch {
      // unresolvable – fall through
    }
    return originalLoad(request, parent, isMain);
  };

  require(commentsRouterPath);
}

describe('comments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // POST /tasks/:taskId/comments — input validation and header gate
  // -------------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({
        body: { content: 'Hello' },
        params: { taskId: '1' },
        headers: {},
      });

      // Act
      await mockRouter['POST:/tasks/:taskId/comments']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(res.json).not.toHaveBeenCalled();
    });

    it('calls next with 400 when content is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({
        body: {},
        params: { taskId: '1' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Act
      await mockRouter['POST:/tasks/:taskId/comments']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 400 when content is whitespace only', async () => {
      // Arrange
      const { req, res, next } = makeMocks({
        body: { content: '   ' },
        params: { taskId: '1' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Act
      await mockRouter['POST:/tasks/:taskId/comments']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 201 with comment data when request is valid', async () => {
      // Arrange
      const comment = { id: 10, content: 'Hello', user_id: 'user-1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [comment] })   // INSERT
        .mockResolvedValueOnce({ rows: [comment] });  // SELECT with author
      const { req, res, next } = makeMocks({
        body: { content: 'Hello' },
        params: { taskId: '1' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Act
      await mockRouter['POST:/tasks/:taskId/comments']?.(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(comment);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PUT /comments/:id — ownership enforcement (authorization)
  // -------------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({
        body: { content: 'Updated' },
        params: { id: '5' },
        headers: {},
      });

      // Act
      await mockRouter['PUT:/comments/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeMocks({
        body: { content: 'Updated' },
        params: { id: '999' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Act
      await mockRouter['PUT:/comments/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('calls next with 403 when requesting user is not the comment author', async () => {
      // Arrange
      // DB returns comment owned by a different user
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-user' }] });
      const { req, res, next } = makeMocks({
        body: { content: 'Updated' },
        params: { id: '5' },
        headers: { 'x-user-id': 'other-user' },
      });

      // Act
      await mockRouter['PUT:/comments/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
      expect(res.json).not.toHaveBeenCalled();
    });

    it('calls next with 400 when content is missing even for the owner', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
      const { req, res, next } = makeMocks({
        body: {},
        params: { id: '5' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Act
      await mockRouter['PUT:/comments/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns updated comment when owner edits with valid content', async () => {
      // Arrange
      const updated = { id: 5, content: 'Updated content', user_id: 'user-1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })  // ownership check
        .mockResolvedValueOnce({ rows: [updated] })                 // UPDATE
        .mockResolvedValueOnce({ rows: [updated] });                // SELECT with author
      const { req, res, next } = makeMocks({
        body: { content: 'Updated content' },
        params: { id: '5' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Act
      await mockRouter['PUT:/comments/:id']?.(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(updated);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /comments/:id — ownership enforcement (authorization)
  // -------------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    it('calls next with 400 when X-User-Id header is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({
        params: { id: '5' },
        headers: {},
      });

      // Act
      await mockRouter['DELETE:/comments/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeMocks({
        params: { id: '999' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Act
      await mockRouter['DELETE:/comments/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('calls next with 403 when requesting user is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-user' }] });
      const { req, res, next } = makeMocks({
        params: { id: '5' },
        headers: { 'x-user-id': 'interloper' },
      });

      // Act
      await mockRouter['DELETE:/comments/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    });

    it('deletes comment and returns confirmation when caller is the owner', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })  // ownership check
        .mockResolvedValueOnce({ rows: [] });                       // DELETE
      const { req, res, next } = makeMocks({
        params: { id: '5' },
        headers: { 'x-user-id': 'user-1' },
      });

      // Act
      await mockRouter['DELETE:/comments/:id']?.(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Comment deleted' }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /tasks/:taskId/comments
  // -------------------------------------------------------------------------
  describe('GET /tasks/:taskId/comments', () => {
    it('returns list of comments for a task', async () => {
      // Arrange
      const comments = [{ id: 1, content: 'First' }, { id: 2, content: 'Second' }];
      mockQuery.mockResolvedValueOnce({ rows: comments });
      const { req, res, next } = makeMocks({ params: { taskId: '1' } });

      // Act
      await mockRouter['GET:/tasks/:taskId/comments']?.(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(comments);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
