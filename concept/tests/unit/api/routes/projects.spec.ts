import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsModulePath = require.resolve('../../../../apps/api/src/routes/projects.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

function findHandler(
  router: any,
  method: string,
  routePath: string,
): ((req: any, res: any, next: any) => Promise<void>) | undefined {
  const layer = router.stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method.toLowerCase()],
  );
  return layer?.route?.stack?.[0]?.handle;
}

async function loadProjectsRouter() {
  delete require.cache[projectsModulePath];

  Module._load = (request: string, parent: any, isMain: boolean) => {
    let resolved: string;
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch {
      return originalLoad(request, parent, isMain);
    }
    if (resolved === databaseModulePath) {
      return { getPool: () => mockPool };
    }
    return originalLoad(request, parent, isMain);
  };

  const router = require(projectsModulePath);
  Module._load = originalLoad;
  return router;
}

describe('projects routes', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadProjectsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ---------------------------------------------------------------------------
  // GET /:id — not-found and success
  // ---------------------------------------------------------------------------
  describe('GET /:id', () => {
    it('returns 404 when project does not exist', async () => {
      // Arrange
      const handler = findHandler(router, 'get', '/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no project found
      const req = { params: { id: '999' }, body: {}, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('returns the project when found', async () => {
      // Arrange
      const handler = findHandler(router, 'get', '/:id')!;
      const project = {
        id: 'uuid-1',
        name: 'Test Project',
        description: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [project] });
      const req = { params: { id: 'uuid-1' }, body: {}, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith(project);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // POST / — input validation and creation
  // ---------------------------------------------------------------------------
  describe('POST /', () => {
    it('returns 400 when project name is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/')!;
      const req = { params: {}, body: {}, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 400 when project name is blank whitespace', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/')!;
      const req = { params: {}, body: { name: '   ' }, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('creates and returns the new project with status 201', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/')!;
      const newProject = {
        id: 'uuid-new',
        name: 'New Project',
        description: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [newProject] });
      const req = { params: {}, body: { name: 'New Project' }, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newProject);
    });

    it('trims whitespace from the project name before inserting', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/')!;
      const newProject = { id: 'uuid-trim', name: 'Trimmed Name', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [newProject] });
      const req = { params: {}, body: { name: '  Trimmed Name  ' }, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[1][0]).toBe('Trimmed Name');
    });
  });
});
