import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');

type RouteHandler = (req: any, res: any, next: any) => unknown | Promise<unknown>;

const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

/**
 * Creates a minimal Express-compatible mock so the real route module can be
 * loaded and its handlers invoked directly, without a running HTTP server.
 */
function createExpressMock() {
  const routes: Record<string, RouteHandler> = {};

  function Router() {
    const instance: Record<string, unknown> = {};
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      instance[method] = (path: string, handler: RouteHandler) => {
        routes[`${method} ${path}`] = handler;
      };
    }
    return instance;
  }

  return { Router, routes };
}

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function loadCommentsRoutes(): Promise<Record<string, RouteHandler>> {
  delete require.cache[commentsModulePath];
  const { Router, routes } = createExpressMock();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router };
    }
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    return originalLoad(request, parent, isMain);
  };

  require(commentsModulePath);
  return routes;
}

describe('comments routes', () => {
  let routes: Record<string, RouteHandler>;

  beforeEach(async () => {
    vi.clearAllMocks();
    routes = await loadCommentsRoutes();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('PUT /comments/:id', () => {
    it('rejects the request when the X-User-Id header is missing', async () => {
      // Arrange
      const req = { params: { id: '5' }, body: { content: 'Updated' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['put /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: '999' }, body: { content: 'Updated' }, headers: { 'x-user-id': '1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['put /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('rejects editing a comment owned by a different user', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '2' }] });
      const req = { params: { id: '5' }, body: { content: 'Updated' }, headers: { 'x-user-id': '1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['put /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only edit your own comments' }),
      );
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects blank content after ownership passes', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1' }] });
      const req = { params: { id: '5' }, body: { content: '   ' }, headers: { 'x-user-id': '1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['put /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('updates the comment when the requester is the author', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: '1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // update
        .mockResolvedValueOnce({ rows: [{ id: 5, content: 'Updated content' }] }); // re-fetch with author
      const req = { params: { id: '5' }, body: { content: 'Updated content' }, headers: { 'x-user-id': '1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['put /comments/:id'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ id: 5, content: 'Updated content' });
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE comments'),
        ['Updated content', '5'],
      );
    });
  });

  describe('DELETE /comments/:id', () => {
    it('rejects the request when the X-User-Id header is missing', async () => {
      // Arrange
      const req = { params: { id: '5' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['delete /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: '999' }, headers: { 'x-user-id': '1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['delete /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('rejects deleting a comment owned by a different user', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '2' }] });
      const req = { params: { id: '5' }, headers: { 'x-user-id': '1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['delete /comments/:id'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403, message: 'You can only delete your own comments' }),
      );
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('deletes the comment when the requester is the author', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: '1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] }); // delete
      const req = { params: { id: '5' }, headers: { 'x-user-id': '1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['delete /comments/:id'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Comment deleted', id: '5' });
      expect(mockQuery).toHaveBeenNthCalledWith(2, 'DELETE FROM comments WHERE id = $1', ['5']);
    });
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('rejects the request when the X-User-Id header is missing', async () => {
      // Arrange
      const req = { params: { taskId: '3' }, body: { content: 'Hello' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['post /tasks/:taskId/comments'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects blank comment content', async () => {
      // Arrange
      const req = { params: { taskId: '3' }, body: { content: '  ' }, headers: { 'x-user-id': '1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['post /tasks/:taskId/comments'](req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('creates a comment for the authenticated user', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // insert
        .mockResolvedValueOnce({ rows: [{ id: 10, content: 'Hello' }] }); // re-fetch with author
      const req = {
        params: { taskId: '3' },
        body: { content: 'Hello' },
        headers: { 'x-user-id': '1' },
      };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await routes['post /tasks/:taskId/comments'](req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 10, content: 'Hello' });
    });
  });
});
