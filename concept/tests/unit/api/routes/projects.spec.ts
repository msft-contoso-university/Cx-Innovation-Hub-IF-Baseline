import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandler, loadRouteModule } from './routeTestHelpers';

const mockQuery = vi.fn();

describe('routes/projects', () => {
  let router: { stack: unknown[] };

  beforeEach(() => {
    mockQuery.mockReset();
    router = loadRouteModule('../../../../apps/api/src/routes/projects.js', mockQuery);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /:id', () => {
    it('returns 404 when the project does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = getRouteHandler(router, 'get', '/:id');
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: 'Project not found' }));
    });

    it('returns the project when found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Taskify' }] });
      const handler = getRouteHandler(router, 'get', '/:id');
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 1, name: 'Taskify' });
    });
  });

  describe('POST /', () => {
    it('rejects a missing name', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockReq({ body: { name: '   ' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: 'Project name is required' }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('trims whitespace from the name and creates the project', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Taskify', description: null }] });
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockReq({ body: { name: '  Taskify  ' } });
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO projects'), ['Taskify', null]);
      expect(res.body).toEqual({ id: 1, name: 'Taskify', description: null });
    });
  });
});
