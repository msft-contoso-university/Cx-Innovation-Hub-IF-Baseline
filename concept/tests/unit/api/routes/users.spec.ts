import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findRoute,
  loadRouteModule,
  FakeResponse,
  type FakeRouter,
} from './testUtils';

const USERS_MODULE = '../../../../apps/api/src/routes/users.js';

describe('users routes', () => {
  let router: FakeRouter;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const loaded = await loadRouteModule(USERS_MODULE);
    router = loaded.router;
    mockQuery = loaded.mockQuery;
  });

  describe('GET /', () => {
    it('returns all users ordered by name', async () => {
      // Arrange
      const users = [{ id: 'u1', name: 'Alice' }];
      mockQuery.mockResolvedValueOnce({ rows: users });
      const handler = findRoute(router, 'get', '/');
      const res = new FakeResponse();

      // Act
      await handler({}, res, () => undefined);

      // Assert
      expect(res.body).toEqual(users);
    });
  });

  describe('GET /:id', () => {
    it('returns 404 when the user does not exist', async () => {
      // Arrange
      const handler = findRoute(router, 'get', '/:id');
      const req = { params: { id: 'missing' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number; message?: string };
      });

      // Assert
      expect(receivedErr?.status).toBe(404);
      expect(receivedErr?.message).toBe('User not found');
    });

    it('returns the user when found', async () => {
      // Arrange
      const handler = findRoute(router, 'get', '/:id');
      const req = { params: { id: 'u1' } };
      const res = new FakeResponse();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'Alice' }] });

      // Act
      await handler(req, res, () => undefined);

      // Assert
      expect(res.body).toEqual({ id: 'u1', name: 'Alice' });
    });
  });
});
