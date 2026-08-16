import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse, findRouteHandler, loadRouterWithMockedPool } from './routeTestHelpers';

const routerModulePath = '../../../../apps/api/src/routes/users.js';

describe('users routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET / returns all users ordered by name', async () => {
    // Arrange
    const rows = [
      { id: 'u1', name: 'Alice', role: 'admin', avatar_color: '#fff' },
      { id: 'u2', name: 'Bob', role: 'member', avatar_color: '#000' },
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/');
    const req = { params: {}, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY name'));
    expect(res.body).toEqual(rows);
    expect(next).not.toHaveBeenCalled();
  });

  it('GET /:id returns 404 for an unknown user', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/:id');
    const req = { params: { id: 'unknown' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toBe('User not found');
  });

  it('GET /:id returns the user when found', async () => {
    // Arrange
    const user = { id: 'u1', name: 'Alice', role: 'admin' };
    const query = vi.fn().mockResolvedValue({ rows: [user] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/:id');
    const req = { params: { id: 'u1' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), ['u1']);
    expect(res.body).toEqual(user);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards database errors to next()', async () => {
    // Arrange
    const dbError = new Error('connection lost');
    const query = vi.fn().mockRejectedValue(dbError);
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/');
    const req = { params: {}, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});
