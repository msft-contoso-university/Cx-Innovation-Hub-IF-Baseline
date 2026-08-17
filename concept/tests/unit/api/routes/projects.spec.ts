import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockResponse,
  findRoute,
  invokeHandler,
  loadRouterModule,
} from './routeTestUtils';

const ROUTE_PATH = '../../../../apps/api/src/routes/projects.js';

describe('projects routes', () => {
  let routes: ReturnType<typeof loadRouterModule>['routes'];
  let mockQuery: ReturnType<typeof loadRouterModule>['mockQuery'];

  beforeEach(() => {
    ({ routes, mockQuery } = loadRouterModule(ROUTE_PATH));
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /', () => {
    it('returns all projects with task counts', async () => {
      // Arrange
      const projects = [{ id: '1', name: 'Project A', task_count: 3, done_count: 1 }];
      mockQuery.mockResolvedValueOnce({ rows: projects });
      const handler = findRoute(routes, 'get', '/');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, {}, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(projects);
    });
  });

  describe('GET /:id', () => {
    it('returns 404 when the project does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'get', '/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(handler, { params: { id: 'missing' } }, res);

      // Assert
      expect(nextError).toMatchObject({ status: 404, message: 'Project not found' });
      expect(res.json).not.toHaveBeenCalled();
    });

    it('returns the project when found', async () => {
      // Arrange
      const project = { id: '1', name: 'Project A' };
      mockQuery.mockResolvedValueOnce({ rows: [project] });
      const handler = findRoute(routes, 'get', '/:id');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { params: { id: '1' } }, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(project);
    });
  });

  describe('POST /', () => {
    it('rejects when name is missing', async () => {
      // Arrange
      const handler = findRoute(routes, 'post', '/');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(handler, { body: {} }, res);

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'Project name is required' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects when name is only whitespace', async () => {
      // Arrange
      const handler = findRoute(routes, 'post', '/');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(handler, { body: { name: '   ' } }, res);

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'Project name is required' });
    });

    it('creates a project and returns 201', async () => {
      // Arrange
      const created = { id: '1', name: 'New Project', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [created] });
      const handler = findRoute(routes, 'post', '/');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { body: { name: 'New Project' } }, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });
});
