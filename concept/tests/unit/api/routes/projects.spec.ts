/**
 * Unit tests for concept/apps/api/src/routes/projects.js
 *
 * Key behaviors under test:
 *  - POST /api/projects  — rejects missing or blank name
 *  - GET  /api/projects/:id — returns 404 when project not found
 *  - GET  /api/projects     — returns list of projects
 */

import { createRequire } from 'node:module';
import { describe, it, expect, vi, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsModulePath = require.resolve('../../../../apps/api/src/routes/projects.js');
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Minimal Express Router mock
// ---------------------------------------------------------------------------

function createMockRouter() {
  const router: any = { stack: [] };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = function (path: string, handler: Function) {
      this.stack.push({
        route: {
          path,
          methods: { [method]: true },
          stack: [{ handle: handler }],
        },
      });
    };
  }
  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function findHandler(router: any, method: string, routePath: string): Function | undefined {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.path === routePath &&
      l.route.methods[method.toLowerCase()],
  );
  if (!layer) return undefined;
  const routeLayers = layer.route.stack;
  return routeLayers[routeLayers.length - 1].handle;
}

function loadRouterWithMockPool(queryResponses: Array<{ rows: any[] }>) {
  delete require.cache[projectsModulePath];

  let callIndex = 0;
  const mockQuery = vi.fn(async () => {
    const response = queryResponses[callIndex] ?? { rows: [] };
    callIndex++;
    return response;
  });
  const mockPool = { query: mockQuery };

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: createMockRouter };
    }
    if (request === '../services/database' || request.endsWith('services/database.js')) {
      return { getPool: () => mockPool };
    }
    if (
      request === '../middleware/errorHandler' ||
      request.endsWith('middleware/errorHandler.js')
    ) {
      return originalLoad(errorHandlerModulePath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  const router = require(projectsModulePath);
  return { router, mockQuery };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /projects', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns a list of projects', async () => {
    // Arrange
    const fakeProjects = [
      { id: 'p-1', name: 'Alpha', task_count: 3, done_count: 1 },
      { id: 'p-2', name: 'Beta', task_count: 0, done_count: 0 },
    ];
    const { router } = loadRouterWithMockPool([{ rows: fakeProjects }]);
    const handler = findHandler(router, 'get', '/')!;
    const req: any = { params: {}, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(fakeProjects);
  });

  it('calls next(err) on database error', async () => {
    // Arrange
    delete require.cache[projectsModulePath];
    const dbError = new Error('connection lost');
    const mockPool = { query: vi.fn().mockRejectedValue(dbError) };
    Module._load = (request: string, parent: unknown, isMain: boolean) => {
      if (request === 'express') return { Router: createMockRouter };
      if (request === '../services/database' || request.endsWith('services/database.js')) {
        return { getPool: () => mockPool };
      }
      if (request === '../middleware/errorHandler' || request.endsWith('middleware/errorHandler.js')) {
        return originalLoad(errorHandlerModulePath, parent, isMain);
      }
      return originalLoad(request, parent, isMain);
    };
    const router = require(projectsModulePath);
    const handler = findHandler(router, 'get', '/')!;
    const req: any = { params: {}, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});

describe('GET /projects/:id', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 404 when project does not exist', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([{ rows: [] }]);
    const handler = findHandler(router, 'get', '/:id')!;
    const req: any = { params: { id: 'p-999' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('returns the project when it exists', async () => {
    // Arrange
    const project = { id: 'p-1', name: 'Alpha', description: null };
    const { router } = loadRouterWithMockPool([{ rows: [project] }]);
    const handler = findHandler(router, 'get', '/:id')!;
    const req: any = { params: { id: 'p-1' }, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(project);
  });
});

describe('POST /projects — input validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('returns 400 when name is absent', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'post', '/')!;
    const req: any = { params: {}, body: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/name/i);
  });

  it('returns 400 when name is blank whitespace', async () => {
    // Arrange
    const { router } = loadRouterWithMockPool([]);
    const handler = findHandler(router, 'post', '/')!;
    const req: any = { params: {}, body: { name: '   ' }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('trims the name and creates the project when valid', async () => {
    // Arrange
    const createdProject = { id: 'p-1', name: 'New Project', description: 'desc' };
    const { router, mockQuery } = loadRouterWithMockPool([{ rows: [createdProject] }]);
    const handler = findHandler(router, 'post', '/')!;
    const req: any = {
      params: {},
      body: { name: '  New Project  ', description: 'desc' },
      headers: {},
    };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdProject);
    // Verify name was trimmed in the query
    const queryArgs = mockQuery.mock.calls[0];
    expect(queryArgs[1][0]).toBe('New Project');
  });

  it('stores null description when not provided', async () => {
    // Arrange
    const createdProject = { id: 'p-2', name: 'No Desc', description: null };
    const { router, mockQuery } = loadRouterWithMockPool([{ rows: [createdProject] }]);
    const handler = findHandler(router, 'post', '/')!;
    const req: any = { params: {}, body: { name: 'No Desc' }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    const queryArgs = mockQuery.mock.calls[0];
    expect(queryArgs[1][1]).toBeNull();
  });
});
