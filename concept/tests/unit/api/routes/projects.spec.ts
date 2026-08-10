import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  getRouteHandler,
  loadRouterWithMockPool,
} from './testHelpers';

const PROJECTS_ROUTE_PATH = '../../../../apps/api/src/routes/projects.js';

describe('projects routes', () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery };

  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('returns all projects with task counts', async () => {
      // Arrange
      const router = loadRouterWithMockPool(PROJECTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'get', '/');
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'project-1', name: 'Project 1', task_count: 3, done_count: 1 }],
      });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual([
        { id: 'project-1', name: 'Project 1', task_count: 3, done_count: 1 },
      ]);
    });
  });

  describe('GET /:id', () => {
    it('returns 404 when the project does not exist', async () => {
      // Arrange
      const router = loadRouterWithMockPool(PROJECTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'get', '/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = createMockRequest({ params: { id: 'missing-project' } });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(404);
      expect(next.mock.calls[0][0].message).toBe('Project not found');
    });

    it('returns the project when it exists', async () => {
      // Arrange
      const router = loadRouterWithMockPool(PROJECTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'get', '/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'project-1', name: 'Project 1' }] });
      const req = createMockRequest({ params: { id: 'project-1' } });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 'project-1', name: 'Project 1' });
    });
  });

  describe('POST /', () => {
    it('rejects requests with a missing or blank name (validation boundary)', async () => {
      // Arrange
      const router = loadRouterWithMockPool(PROJECTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({ body: { name: '   ' } });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Project name is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates a project when a valid name is provided', async () => {
      // Arrange
      const router = loadRouterWithMockPool(PROJECTS_ROUTE_PATH, mockPool);
      const handler = getRouteHandler(router, 'post', '/');
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'project-1', name: 'New Project', description: null }],
      });
      const req = createMockRequest({ body: { name: '  New Project  ' } });
      const res = createMockResponse();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 'project-1', name: 'New Project', description: null });
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['New Project', null]);
    });
  });
});
