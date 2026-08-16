import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse, findRouteHandler, loadRouterWithMockedPool } from './routeTestHelpers';

const routerModulePath = '../../../../apps/api/src/routes/projects.js';

describe('projects routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET / returns projects with task counts', async () => {
    // Arrange
    const rows = [{ id: 'p1', name: 'Project One', task_count: 3, done_count: 1 }];
    const query = vi.fn().mockResolvedValue({ rows });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/');
    const req = { params: {}, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(res.body).toEqual(rows);
    expect(next).not.toHaveBeenCalled();
  });

  it('GET /:id returns 404 when the project does not exist', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/:id');
    const req = { params: { id: 'missing' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toBe('Project not found');
  });

  it('GET /:id returns the project when found', async () => {
    // Arrange
    const project = { id: 'p1', name: 'Project One' };
    const query = vi.fn().mockResolvedValue({ rows: [project] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/:id');
    const req = { params: { id: 'p1' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(res.body).toEqual(project);
    expect(next).not.toHaveBeenCalled();
  });

  it('POST / rejects a missing or blank project name', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'post', '/');
    const req = { params: {}, body: { name: '   ' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toBe('Project name is required');
  });

  it('POST / trims the name and creates a project', async () => {
    // Arrange
    const created = { id: 'p2', name: 'New Project', description: null };
    const query = vi.fn().mockResolvedValue({ rows: [created] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'post', '/');
    const req = { params: {}, body: { name: '  New Project  ' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO projects'), ['New Project', null]);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(created);
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
