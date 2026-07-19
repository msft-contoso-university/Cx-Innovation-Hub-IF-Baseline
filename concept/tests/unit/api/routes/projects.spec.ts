import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsModulePath = require.resolve('../../../../apps/api/src/routes/projects.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type HandlerMap = Record<string, Function>;

function makeRes() {
  const mockJson = vi.fn();
  const mockStatus = vi.fn(() => ({ json: mockJson }));
  return { res: { status: mockStatus, json: mockJson }, mockStatus, mockJson };
}

// ---------------------------------------------------------------------------
// Setup: intercept Module._load for each test
// ---------------------------------------------------------------------------

describe('projects route', () => {
  let handlers: HandlerMap;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handlers = {};
    mockQuery = vi.fn();

    delete require.cache[projectsModulePath];

    Module._load = (request: string, parent: unknown, isMain: boolean) => {
      if (request === 'express') {
        return {
          Router: () => {
            const router: any = {};
            for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
              router[method] = (path: string, handler: Function) => {
                handlers[`${method.toUpperCase()} ${path}`] = handler;
              };
            }
            return router;
          },
        };
      }
      if (request === '../services/database') {
        return { getPool: () => ({ query: mockQuery }) };
      }
      return originalLoad(request, parent, isMain);
    };

    require(projectsModulePath);
  });

  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[projectsModulePath];
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------
  describe('POST /', () => {
    it('calls next with 400 when name is absent from body', async () => {
      // Arrange
      const req = { body: {} };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers['POST /']!(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toBe('Project name is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('calls next with 400 when name is whitespace only', async () => {
      // Arrange
      const req = { body: { name: '   ' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers['POST /']!(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('inserts the project and responds with 201 when name is valid', async () => {
      // Arrange
      const created = { id: 'uuid-abc', name: 'Alpha', description: null, created_at: '2024-01-01' };
      mockQuery.mockResolvedValueOnce({ rows: [created] });

      const req = { body: { name: 'Alpha' } };
      const { res, mockStatus, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers['POST /']!(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith(created);
      expect(next).not.toHaveBeenCalled();
    });

    it('trims the project name before inserting', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-xyz', name: 'Trimmed' }] });

      const req = { body: { name: '  Trimmed  ' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers['POST /']!(req, res, next);

      // Assert
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params[0]).toBe('Trimmed');
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------
  describe('GET /:id', () => {
    it('calls next with 404 when project is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = { params: { id: 'nonexistent-uuid' } };
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers['GET /:id']!(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0].status).toBe(404);
      expect(next.mock.calls[0][0].message).toBe('Project not found');
    });

    it('returns the project when found', async () => {
      // Arrange
      const project = { id: 'uuid-1', name: 'Project One' };
      mockQuery.mockResolvedValueOnce({ rows: [project] });

      const req = { params: { id: 'uuid-1' } };
      const { res, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers['GET /:id']!(req, res, next);

      // Assert
      expect(mockJson).toHaveBeenCalledWith(project);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------
  describe('GET /', () => {
    it('returns all projects from the database', async () => {
      // Arrange
      const projects = [{ id: 'uuid-1', name: 'P1', task_count: 3 }];
      mockQuery.mockResolvedValueOnce({ rows: projects });

      const req = {};
      const { res, mockJson } = makeRes();
      const next = vi.fn();

      // Act
      await handlers['GET /']!(req, res, next);

      // Assert
      expect(mockJson).toHaveBeenCalledWith(projects);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next when database throws', async () => {
      // Arrange
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const req = {};
      const { res } = makeRes();
      const next = vi.fn();

      // Act
      await handlers['GET /']!(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0].message).toBe('DB error');
    });
  });
});
