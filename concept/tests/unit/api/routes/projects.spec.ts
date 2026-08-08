import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findRoute,
  loadRouteModule,
  FakeResponse,
  type FakeRouter,
} from './testUtils';

const PROJECTS_MODULE = '../../../../apps/api/src/routes/projects.js';

describe('projects routes', () => {
  let router: FakeRouter;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const loaded = await loadRouteModule(PROJECTS_MODULE);
    router = loaded.router;
    mockQuery = loaded.mockQuery;
  });

  describe('GET /', () => {
    it('returns all projects with task counts', async () => {
      // Arrange
      const projects = [{ id: 'p1', name: 'Demo', task_count: 3, done_count: 1 }];
      mockQuery.mockResolvedValueOnce({ rows: projects });
      const handler = findRoute(router, 'get', '/');
      const req = {};
      const res = new FakeResponse();

      // Act
      await handler(req, res, () => undefined);

      // Assert
      expect(res.body).toEqual(projects);
    });
  });

  describe('GET /:id', () => {
    it('returns 404 when the project does not exist', async () => {
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
      expect(receivedErr?.message).toBe('Project not found');
    });

    it('returns the project when found', async () => {
      // Arrange
      const handler = findRoute(router, 'get', '/:id');
      const req = { params: { id: 'p1' } };
      const res = new FakeResponse();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Demo' }] });

      // Act
      await handler(req, res, () => undefined);

      // Assert
      expect(res.body).toEqual({ id: 'p1', name: 'Demo' });
    });
  });

  describe('POST /', () => {
    it('rejects a missing name with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/');
      const req = { body: {} };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number; message?: string };
      });

      // Assert
      expect(receivedErr?.status).toBe(400);
      expect(receivedErr?.message).toBe('Project name is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only name with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/');
      const req = { body: { name: '   ' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number } | undefined;

      // Act
      await handler(req, res, (err) => {
        receivedErr = err as { status?: number };
      });

      // Assert
      expect(receivedErr?.status).toBe(400);
    });

    it('creates a project when the name is present', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/');
      const req = { body: { name: 'New Project' } };
      const res = new FakeResponse();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p2', name: 'New Project' }] });

      // Act
      await handler(req, res, () => undefined);

      // Assert
      expect(mockQuery.mock.calls[0][1]).toEqual(['New Project', null]);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 'p2', name: 'New Project' });
    });
  });
});
