import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsModulePath = require.resolve('../../../../apps/api/src/routes/projects.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Lightweight Express Router mock (avoids requiring express in the test env)
// ---------------------------------------------------------------------------

function createMockRouter() {
  const stack: any[] = [];
  const router: any = { stack };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (routePath: string, handler: Function) => {
      stack.push({
        route: {
          path: routePath,
          methods: { [method]: true },
          stack: [{ handle: handler }],
        },
      });
    };
  }
  return router;
}

const expressMock = { Router: createMockRouter };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pulls the async handler for (method, routePath) from a mock Router. */
function getHandler(router: any, method: string, routePath: string): Function {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.path === routePath &&
      l.route.methods[method.toLowerCase()],
  );
  if (!layer) throw new Error(`No ${method} ${routePath} route found`);
  return layer.route.stack[0].handle;
}

function buildRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json }, status, json };
}

// Real createError loaded once — no external deps.
const { createError } = require(errorHandlerModulePath);

async function loadRouter(mockGetPool: () => any) {
  delete require.cache[projectsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return expressMock;

    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databaseModulePath) {
        return { getPool: mockGetPool };
      }
      if (resolved === errorHandlerModulePath) {
        return { createError };
      }
    } catch {
      // ignore resolution errors
    }
    return originalLoad(request, parent, isMain);
  };

  return require(projectsModulePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('projects routes', () => {
  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[projectsModulePath];
  });

  // ── GET /api/projects ────────────────────────────────────────────────────
  describe('GET /', () => {
    it('returns project rows from the database', async () => {
      // Arrange
      const mockRows = [{ id: 1, name: 'Alpha', task_count: 3, done_count: 1 }];
      const mockQuery = vi.fn().mockResolvedValue({ rows: mockRows });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'get', '/');

      const req = {};
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(json).toHaveBeenCalledWith(mockRows);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards database errors to next', async () => {
      // Arrange
      const dbError = new Error('DB failure');
      const mockQuery = vi.fn().mockRejectedValue(dbError);
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'get', '/');

      const req = {};
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // ── GET /api/projects/:id ─────────────────────────────────────────────────
  describe('GET /:id', () => {
    it('returns the project when found', async () => {
      // Arrange
      const project = { id: 42, name: 'Beta', description: null };
      const mockQuery = vi.fn().mockResolvedValue({ rows: [project] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'get', '/:id');

      const req = { params: { id: '42' } };
      const { res, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(json).toHaveBeenCalledWith(project);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next with a 404 error when project is not found', async () => {
      // Arrange
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'get', '/:id');

      const req = { params: { id: '999' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/project not found/i);
    });
  });

  // ── POST /api/projects ────────────────────────────────────────────────────
  describe('POST /', () => {
    it('rejects an empty name with a 400 error', async () => {
      // Arrange
      const mockQuery = vi.fn();
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'post', '/');

      const req = { body: { name: '   ' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/project name is required/i);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a missing name with a 400 error', async () => {
      // Arrange
      const mockQuery = vi.fn();
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'post', '/');

      const req = { body: {} };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('creates a project and responds with 201', async () => {
      // Arrange
      const created = { id: 1, name: 'New Project', description: 'desc' };
      const mockQuery = vi.fn().mockResolvedValue({ rows: [created] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'post', '/');

      const req = { body: { name: '  New Project  ', description: 'desc' } };
      const { res, status, json } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(status).toHaveBeenCalledWith(201);
      expect(json).toHaveBeenCalledWith(created);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['New Project', 'desc'],
      );
    });

    it('inserts null when description is omitted', async () => {
      // Arrange
      const created = { id: 2, name: 'No-Desc', description: null };
      const mockQuery = vi.fn().mockResolvedValue({ rows: [created] });
      const router = await loadRouter(() => ({ query: mockQuery }));
      const handler = getHandler(router, 'post', '/');

      const req = { body: { name: 'No-Desc' } };
      const { res } = buildRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['No-Desc', null],
      );
    });
  });
});
