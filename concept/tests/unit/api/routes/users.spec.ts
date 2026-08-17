import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockResponse,
  findRoute,
  invokeHandler,
  loadRouterModule,
} from './routeTestUtils';

const ROUTE_PATH = '../../../../apps/api/src/routes/users.js';

describe('users routes', () => {
  let routes: ReturnType<typeof loadRouterModule>['routes'];
  let mockQuery: ReturnType<typeof loadRouterModule>['mockQuery'];

  beforeEach(() => {
    ({ routes, mockQuery } = loadRouterModule(ROUTE_PATH));
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /', () => {
    it('returns all users', async () => {
      // Arrange
      const users = [{ id: 'u1', name: 'Ada' }];
      mockQuery.mockResolvedValueOnce({ rows: users });
      const handler = findRoute(routes, 'get', '/');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, {}, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(users);
    });
  });

  describe('GET /:id', () => {
    it('returns 404 when the user does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'get', '/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(handler, { params: { id: 'missing' } }, res);

      // Assert
      expect(nextError).toMatchObject({ status: 404, message: 'User not found' });
      expect(res.json).not.toHaveBeenCalled();
    });

    it('returns the user when found', async () => {
      // Arrange
      const user = { id: 'u1', name: 'Ada' };
      mockQuery.mockResolvedValueOnce({ rows: [user] });
      const handler = findRoute(routes, 'get', '/:id');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { params: { id: 'u1' } }, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(user);
    });
  });
});
