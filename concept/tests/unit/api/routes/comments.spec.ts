import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const commentsModulePath = require.resolve('../../../../apps/api/src/routes/comments.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type HandlerMap = Record<string, Function>;

function makeRes() {
  const mockJson = vi.fn();
  const mockStatus = vi.fn(() => ({ json: mockJson }));
  return { res: { status: mockStatus, json: mockJson }, mockStatus, mockJson };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('comments route', () => {
  let handlers: HandlerMap;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handlers = {};
    mockQuery = vi.fn();

    delete require.cache[commentsModulePath];

    Module._load = (request: string, parent: unknown, isMain: boolean) => {
      if (request === 'express') {
        return {
          Router: () => {
            const router: any = {};
            for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
              router[method] = (path: string, handler: Function) => {
                handlers[`${method.toUpperCase()} ${path}`] = handler;
              };
            }
            return router;
          },
        };
      }
      if (request === '../services/database') {
        return { getPool: () => ({ query: mockQuery }) };
      }
      return originalLoad(request, parent, isMain);
    };

    require(commentsModulePath);
  });

  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[commentsModulePath];
  });

  // -------------------------------------------------------------------------
  // POST /tasks/:taskId/comments
  // -------------------------------------------------------------------------
  describe('POST /tasks/:taskId/comments', () => {
    const handlerKey = 'POST /tasks/:taskId/comments';

    it('calls next with 400 when X-User-Id header is absent', async () => {
      // Arrange
      const req = { headers: {}, body: { content: 'Hello' }, params: { taskId: 'task-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('X-User-Id header is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when content is absent', async () => {
      // Arrange
      const req = { headers: { 'x-user-id': 'user-1' }, body: {}, params: { taskId: 'task-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Comment content is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when content is whitespace only', async () => {
      // Arrange
      const req = {
        headers: { 'x-user-id': 'user-1' },
        body: { content: '   ' },
        params: { taskId: 'task-1' },
      };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates comment and responds 201 when inputs are valid', async () => {
      // Arrange
      const created = { id: 'c-1', content: 'Nice work', user_id: 'user-1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [created] })              // INSERT
        .mockResolvedValueOnce({ rows: [{ ...created, author_name: 'Alice' }] }); // SELECT

      const req = {
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'Nice work' },
        params: { taskId: 'task-1' },
      };
      const { res, mockStatus, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PUT /comments/:id
  // -------------------------------------------------------------------------
  describe('PUT /comments/:id', () => {
    const handlerKey = 'PUT /comments/:id';

    it('calls next with 400 when X-User-Id header is absent', async () => {
      // Arrange
      const req = {
        headers: {},
        body: { content: 'Updated text' },
        params: { id: 'c-1' },
      };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('X-User-Id header is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = {
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'Updated' },
        params: { id: 'nonexistent' },
      };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('calls next with 403 when user is not the comment author', async () => {
      // Arrange – DB returns a comment owned by a different user
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-user' }] });

      const req = {
        headers: { 'x-user-id': 'different-user' },
        body: { content: 'Sneaky edit' },
        params: { id: 'c-1' },
      };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toBe('You can only edit your own comments');
    });

    it('calls next with 400 when content is absent (owner making request)', async () => {
      // Arrange – ownership check passes
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

      const req = {
        headers: { 'x-user-id': 'user-1' },
        body: {},
        params: { id: 'c-1' },
      };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Comment content is required');
    });

    it('updates comment and returns result when owner provides valid content', async () => {
      // Arrange
      const updated = { id: 'c-1', content: 'Fixed text', user_id: 'user-1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })  // ownership check
        .mockResolvedValueOnce({ rows: [updated] })                  // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...updated, author_name: 'Alice' }] }); // SELECT

      const req = {
        headers: { 'x-user-id': 'user-1' },
        body: { content: 'Fixed text' },
        params: { id: 'c-1' },
      };
      const { res, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(mockJson).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /comments/:id
  // -------------------------------------------------------------------------
  describe('DELETE /comments/:id', () => {
    const handlerKey = 'DELETE /comments/:id';

    it('calls next with 400 when X-User-Id header is absent', async () => {
      // Arrange
      const req = { headers: {}, params: { id: 'c-1' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('X-User-Id header is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 404 when comment does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = {
        headers: { 'x-user-id': 'user-1' },
        params: { id: 'nonexistent' },
      };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('calls next with 403 when user is not the comment author', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-user' }] });

      const req = {
        headers: { 'x-user-id': 'intruder' },
        params: { id: 'c-1' },
      };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toBe('You can only delete your own comments');
    });

    it('deletes comment and returns confirmation when owner requests', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })  // ownership check
        .mockResolvedValueOnce({ rows: [] });                        // DELETE

      const req = {
        headers: { 'x-user-id': 'user-1' },
        params: { id: 'c-1' },
      };
      const { res, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers[handlerKey]!(req, res, next);

      // Assert
      expect(mockJson).toHaveBeenCalledWith({ message: 'Comment deleted', id: 'c-1' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
