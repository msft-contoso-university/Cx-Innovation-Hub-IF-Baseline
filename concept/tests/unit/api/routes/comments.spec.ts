import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

function findHandler(
  router: any,
  method: string,
  routePath: string,
): ((req: any, res: any, next: any) => Promise<void>) | undefined {
  const layer = router.stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method.toLowerCase()],
  );
  return layer?.route?.stack?.[0]?.handle;
}

async function loadCommentsRouter() {
  delete require.cache[commentsModulePath];

  Module._load = (request: string, parent: any, isMain: boolean) => {
    let resolved: string;
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch {
      return originalLoad(request, parent, isMain);
    }
    if (resolved === databaseModulePath) {
      return { getPool: () => mockPool };
    }
    return originalLoad(request, parent, isMain);
  };

  const router = require(commentsModulePath);
  Module._load = originalLoad;
  return router;
}

describe('comments routes', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadCommentsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ---------------------------------------------------------------------------
  // POST /tasks/:taskId/comments — input validation
  // ---------------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments')!;
      const req = { params: { taskId: '1' }, headers: {}, body: { content: 'Hello' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 400 when comment content is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments')!;
      const req = { params: { taskId: '1' }, headers: { 'x-user-id': 'user-1' }, body: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 400 when comment content is blank whitespace', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/tasks/:taskId/comments')!;
      const req = {
        params: { taskId: '1' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: '   ' },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /comments/:id — authorization and ownership enforcement
  // ---------------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'put', '/comments/:id')!;
      const req = { params: { id: '1' }, headers: {}, body: { content: 'Updated' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 404 when comment does not exist', async () => {
      // Arrange
      const handler = findHandler(router, 'put', '/comments/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check returns nothing
      const req = {
        params: { id: '99' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'Updated' },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('returns 403 when user is not the comment author', async () => {
      // Arrange
      const handler = findHandler(router, 'put', '/comments/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-user' }] }); // different owner
      const req = {
        params: { id: '1' },
        headers: { 'x-user-id': 'different-user' },
        body: { content: 'Hijacked content' },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    });

    it('returns 400 when content is empty after ownership check passes', async () => {
      // Arrange
      const handler = findHandler(router, 'put', '/comments/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }); // ownership matches
      const req = {
        params: { id: '1' },
        headers: { 'x-user-id': 'user-1' },
        body: { content: '' },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /comments/:id — authorization and ownership enforcement
  // ---------------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'delete', '/comments/:id')!;
      const req = { params: { id: '1' }, headers: {}, body: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 404 when comment does not exist', async () => {
      // Arrange
      const handler = findHandler(router, 'delete', '/comments/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [] }); // comment not found
      const req = {
        params: { id: '99' },
        headers: { 'x-user-id': 'user-1' },
        body: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('returns 403 when user is not the comment author', async () => {
      // Arrange
      const handler = findHandler(router, 'delete', '/comments/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-user' }] }); // different owner
      const req = {
        params: { id: '1' },
        headers: { 'x-user-id': 'attacker' },
        body: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    });
  });
});
