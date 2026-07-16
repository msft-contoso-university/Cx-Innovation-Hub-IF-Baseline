import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  require,
  createMockPool,
  createMockRes,
  getRouteHandler,
  loadRouteModule,
  Module,
  originalLoad,
} from './_helpers.js';

const usersModulePath = require.resolve(
  '../../../../apps/api/src/routes/users.js',
);

describe('users routes', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let router: any;
  let teardown: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ mockPool, mockQuery } = createMockPool());
    ({ router, teardown } = await loadRouteModule(usersModulePath, {
      getPool: () => mockPool,
    }));
  });

  afterEach(() => {
    teardown();
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // GET /  (list users)
  // -------------------------------------------------------------------------

  describe('GET /', () => {
    it('returns an array of users ordered by name', async () => {
      // Arrange
      const users = [
        { id: 'u1', name: 'Alice', role: 'dev', avatar_color: '#f00' },
        { id: 'u2', name: 'Bob', role: 'pm', avatar_color: '#0f0' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: users });

      const handler = getRouteHandler(router, 'get', '/');
      const req: any = { body: {}, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(users);
      expect(next).not.toHaveBeenCalled();
    });

    it('passes database errors to next()', async () => {
      // Arrange
      const dbError = new Error('DB error');
      mockQuery.mockRejectedValueOnce(dbError);

      const handler = getRouteHandler(router, 'get', '/');
      const req: any = { body: {}, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id  (get user by id)
  // -------------------------------------------------------------------------

  describe('GET /:id', () => {
    it('calls next with 404 when user is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const handler = getRouteHandler(router, 'get', '/:id');
      const req: any = { body: {}, params: { id: 'nonexistent' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'User not found' }),
      );
    });

    it('returns the user when found', async () => {
      // Arrange
      const user = { id: 'u1', name: 'Alice', role: 'dev', avatar_color: '#f00' };
      mockQuery.mockResolvedValueOnce({ rows: [user] });

      const handler = getRouteHandler(router, 'get', '/:id');
      const req: any = { body: {}, params: { id: 'u1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(user);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
