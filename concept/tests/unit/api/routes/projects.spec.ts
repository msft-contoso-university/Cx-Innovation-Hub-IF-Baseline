/**
 * Unit tests for the projects route handlers.
 *
 * Focuses on input validation:
 *   - POST requires a non-blank project name
 *   - GET /:id returns 404 when project not found
 *
 * DB interactions are mocked via Module._load interception.
 */

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const expressModule = require('express');

const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMockPool(queryImpl: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { query: vi.fn().mockImplementation(queryImpl) };
}

function findHandler(router: any, method: string, routePath: string) {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.methods[method.toLowerCase()] === true &&
      l.route.path === routePath,
  );
  if (!layer) throw new Error(`Handler not found: ${method.toUpperCase()} ${routePath}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

async function loadProjectsRouter(mockPool: ReturnType<typeof makeMockPool>) {
  delete require.cache[projectsRoutePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return expressModule;
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  return require(projectsRoutePath);
}

// ---------------------------------------------------------------------------
// Tests – POST /api/projects
// ---------------------------------------------------------------------------
describe('projects route – POST /', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when name is absent from the request body', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadProjectsRouter(mockPool);
    const handler = findHandler(router, 'post', '/');

    const req: any = { body: {} };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Project name is required' }),
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 400 when name is whitespace only', async () => {
    // Arrange
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadProjectsRouter(mockPool);
    const handler = findHandler(router, 'post', '/');

    const req: any = { body: { name: '   ' } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Project name is required' }),
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('trims whitespace from the project name before inserting', async () => {
    // Arrange
    const insertedRows = [{ id: '1', name: 'My Project', description: null }];
    const mockPool = makeMockPool(async () => ({ rows: insertedRows }));
    const router = await loadProjectsRouter(mockPool);
    const handler = findHandler(router, 'post', '/');

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res: any = { status };
    const req: any = { body: { name: '  My Project  ' } };
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO projects'),
      expect.arrayContaining(['My Project']),
    );
    expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });
});

// ---------------------------------------------------------------------------
// Tests – GET /api/projects/:id
// ---------------------------------------------------------------------------
describe('projects route – GET /:id', () => {
  afterEach(() => { Module._load = originalLoad; });

  it('returns 404 when the project does not exist', async () => {
    // Arrange – DB returns no rows
    const mockPool = makeMockPool(async () => ({ rows: [] }));
    const router = await loadProjectsRouter(mockPool);
    const handler = findHandler(router, 'get', '/:id');

    const req: any = { params: { id: '999' } };
    const next = vi.fn();

    // Act
    await handler(req, {}, next);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Project not found' }),
    );
  });
});
