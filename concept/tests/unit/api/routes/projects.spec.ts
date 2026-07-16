import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  require,
  createMockPool,
  createMockRes,
  getRouteHandler,
  loadRouteModule,
} from './_helpers.js';
import { Module, originalLoad } from './_helpers.js';

const projectsModulePath = require.resolve(
  '../../../../apps/api/src/routes/projects.js',
);

describe('projects routes', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let router: any;
  let teardown: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ mockPool, mockQuery } = createMockPool());
    ({ router, teardown } = await loadRouteModule(projectsModulePath, {
      getPool: () => mockPool,
    }));
  });

  afterEach(() => {
    teardown();
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // POST /  (create project)
  // -------------------------------------------------------------------------

  describe('POST /', () => {
    it('calls next with 400 when name is missing from body', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/');
      const req: any = { body: {}, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Project name is required' }),
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when name is an empty string', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/');
      const req: any = { body: { name: '' }, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('calls next with 400 when name is whitespace only', async () => {
      // Arrange
      const handler = getRouteHandler(router, 'post', '/');
      const req: any = { body: { name: '   ' }, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('inserts project and responds 201 on success', async () => {
      // Arrange
      const newProject = { id: 'proj-1', name: 'My Project', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [newProject] });

      const handler = getRouteHandler(router, 'post', '/');
      const req: any = { body: { name: 'My Project' }, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledOnce();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newProject);
      expect(next).not.toHaveBeenCalled();
    });

    it('trims the project name before inserting', async () => {
      // Arrange
      const newProject = { id: 'proj-2', name: 'Trimmed', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [newProject] });

      const handler = getRouteHandler(router, 'post', '/');
      const req: any = { body: { name: '  Trimmed  ' }, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert — query should be called with the trimmed value
      const [sql, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('Trimmed');
    });

    it('passes database errors to next()', async () => {
      // Arrange
      const dbError = new Error('DB failure');
      mockQuery.mockRejectedValueOnce(dbError);

      const handler = getRouteHandler(router, 'post', '/');
      const req: any = { body: { name: 'Good Name' }, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // -------------------------------------------------------------------------
  // GET /  (list projects)
  // -------------------------------------------------------------------------

  describe('GET /', () => {
    it('returns an array of projects', async () => {
      // Arrange
      const projects = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
      mockQuery.mockResolvedValueOnce({ rows: projects });

      const handler = getRouteHandler(router, 'get', '/');
      const req: any = { body: {}, params: {}, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(projects);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id  (get project by id)
  // -------------------------------------------------------------------------

  describe('GET /:id', () => {
    it('calls next with 404 when project is not found', async () => {
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
        expect.objectContaining({ status: 404, message: 'Project not found' }),
      );
    });

    it('returns the project when found', async () => {
      // Arrange
      const project = { id: 'proj-1', name: 'Existing', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [project] });

      const handler = getRouteHandler(router, 'get', '/:id');
      const req: any = { body: {}, params: { id: 'proj-1' }, headers: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(project);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
