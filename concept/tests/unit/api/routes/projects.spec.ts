/**
 * Unit tests for the /api/projects route handlers.
 *
 * Strategy: load the CommonJS router with Module._load interception so that
 * `../services/database` returns a controllable mock pool.  Route handlers are
 * extracted from router.stack and invoked directly with mock req/res/next
 * objects – no HTTP server is required.
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsRoutePath = require.resolve(
  '../../../../apps/api/src/routes/projects.js'
);
const databasePath = require.resolve(
  '../../../../apps/api/src/services/database.js'
);
const errorHandlerPath = require.resolve(
  '../../../../apps/api/src/middleware/errorHandler.js'
);
// Resolve express from the test project's own node_modules so it can be
// provided to the route modules via Module._load interception.
const expressModulePath = require.resolve('express');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeNext() {
  return vi.fn();
}

/** Extract a route handler from an express Router by HTTP method and path. */
function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) =>
      l.route?.path === path &&
      l.route?.methods?.[method.toLowerCase()]
  );
  if (!layer) throw new Error(`No ${method} ${path} route found`);
  return layer.route.stack[0].handle as (
    req: any,
    res: any,
    next: any
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let mockQuery: ReturnType<typeof vi.fn>;

async function loadRouter() {
  delete require.cache[projectsRoutePath];
  delete require.cache[databasePath];

  mockQuery = vi.fn();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return originalLoad(expressModulePath, parent, isMain);
    }
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databasePath) {
        return { getPool: () => ({ query: mockQuery }) };
      }
      if (resolved === errorHandlerPath) {
        return originalLoad(errorHandlerPath, parent, isMain);
      }
    } catch {}
    return originalLoad(request, parent, isMain);
  };

  return require(projectsRoutePath);
}

describe('projects routes', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /api/projects — input validation
  // -------------------------------------------------------------------------
  describe('POST / (create project)', () => {
    it('calls next with 400 when name is missing', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'post', '/');
      const req: any = { body: {} };
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/name is required/i);
    });

    it('calls next with 400 when name is blank whitespace', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'post', '/');
      const req: any = { body: { name: '   ' } };
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('inserts the project and responds 201 on success', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'post', '/');
      const newProject = {
        id: 'uuid-1',
        name: 'Alpha',
        description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [newProject] });

      const req: any = { body: { name: 'Alpha' } };
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newProject);
    });

    it('trims whitespace from name before inserting', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'post', '/');
      const newProject = { id: 'uuid-2', name: 'Trimmed', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [newProject] });

      const req: any = { body: { name: '  Trimmed  ' } };
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT'),
        expect.arrayContaining(['Trimmed'])
      );
    });

    it('propagates database errors to next', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'post', '/');
      const dbError = new Error('DB connection lost');
      mockQuery.mockRejectedValueOnce(dbError);

      const req: any = { body: { name: 'Fail Project' } };
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // -------------------------------------------------------------------------
  // GET / — list projects
  // -------------------------------------------------------------------------
  describe('GET / (list projects)', () => {
    it('returns all projects as JSON', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'get', '/');
      const projects = [
        { id: 'p1', name: 'Proj 1', task_count: 3, done_count: 1 },
        { id: 'p2', name: 'Proj 2', task_count: 0, done_count: 0 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: projects });

      const req: any = {};
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(projects);
    });

    it('propagates database errors to next', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'get', '/');
      const dbError = new Error('query timeout');
      mockQuery.mockRejectedValueOnce(dbError);

      const req: any = {};
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id — get single project
  // -------------------------------------------------------------------------
  describe('GET /:id (get project by id)', () => {
    it('returns the project when found', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'get', '/:id');
      const project = { id: 'p1', name: 'Alpha', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [project] });

      const req: any = { params: { id: 'p1' } };
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(project);
    });

    it('calls next with 404 when project is not found', async () => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'get', '/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req: any = { params: { id: 'missing-uuid' } };
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/not found/i);
    });
  });
});
