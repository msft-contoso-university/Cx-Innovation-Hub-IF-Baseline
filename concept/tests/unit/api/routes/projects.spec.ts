import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsRouterPath = require.resolve('../../../../apps/api/src/routes/projects.js');
const databasePath = require.resolve('../../../../apps/api/src/services/database.js');

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
const mockDatabase = { getPool: () => mockPool };

interface RouterHandlers {
  [key: string]: (req: any, res: any, next: any) => Promise<void>;
}

interface MockRouter extends RouterHandlers {
  get: (path: string, handler: Function) => void;
  post: (path: string, handler: Function) => void;
}

let mockRouter: MockRouter;

function createMockRouter(): MockRouter {
  const handlers: RouterHandlers = {};
  const router = handlers as MockRouter;
  router.get = (path: string, handler: Function) => { handlers[`GET:${path}`] = handler as any; };
  router.post = (path: string, handler: Function) => { handlers[`POST:${path}`] = handler as any; };
  return router;
}

function makeMocks(overrides: { body?: object; params?: object } = {}) {
  const req = { body: overrides.body ?? {}, params: overrides.params ?? {}, headers: {} } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  return { req, res, next };
}

function loadRouter() {
  mockRouter = createMockRouter();
  delete require.cache[projectsRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databasePath) {
        return mockDatabase;
      }
    } catch {
      // unresolvable – fall through
    }
    return originalLoad(request, parent, isMain);
  };

  require(projectsRouterPath);
}

describe('projects routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------
  describe('POST /', () => {
    it('calls next with 400 when name is missing', async () => {
      // Arrange
      const { req, res, next } = makeMocks({ body: {} });

      // Act
      await mockRouter['POST:/']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(res.json).not.toHaveBeenCalled();
    });

    it('calls next with 400 when name is whitespace only', async () => {
      // Arrange
      const { req, res, next } = makeMocks({ body: { name: '   ' } });

      // Act
      await mockRouter['POST:/']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 201 with the created project when name is valid', async () => {
      // Arrange
      const created = { id: 1, name: 'Alpha', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [created] });
      const { req, res, next } = makeMocks({ body: { name: 'Alpha' } });

      // Act
      await mockRouter['POST:/']?.(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
      expect(next).not.toHaveBeenCalled();
    });

    it('trims leading/trailing whitespace from project name', async () => {
      // Arrange
      const created = { id: 2, name: 'Beta', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [created] });
      const { req, res, next } = makeMocks({ body: { name: '  Beta  ' } });

      // Act
      await mockRouter['POST:/']?.(req, res, next);

      // Assert
      const [sql, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('Beta');
    });

    it('forwards database errors to next', async () => {
      // Arrange
      const dbError = new Error('DB failure');
      mockQuery.mockRejectedValueOnce(dbError);
      const { req, res, next } = makeMocks({ body: { name: 'Valid' } });

      // Act
      await mockRouter['POST:/']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------
  describe('GET /:id', () => {
    it('calls next with 404 when the project does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeMocks({ params: { id: '999' } });

      // Act
      await mockRouter['GET:/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
      expect(res.json).not.toHaveBeenCalled();
    });

    it('returns the project when found', async () => {
      // Arrange
      const project = { id: 1, name: 'Alpha', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [project] });
      const { req, res, next } = makeMocks({ params: { id: '1' } });

      // Act
      await mockRouter['GET:/:id']?.(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(project);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards database errors to next', async () => {
      // Arrange
      const dbError = new Error('DB failure');
      mockQuery.mockRejectedValueOnce(dbError);
      const { req, res, next } = makeMocks({ params: { id: '1' } });

      // Act
      await mockRouter['GET:/:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------
  describe('GET /', () => {
    it('returns array of projects from the database', async () => {
      // Arrange
      const projects = [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }];
      mockQuery.mockResolvedValueOnce({ rows: projects });
      const { req, res, next } = makeMocks();

      // Act
      await mockRouter['GET:/']?.(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(projects);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
