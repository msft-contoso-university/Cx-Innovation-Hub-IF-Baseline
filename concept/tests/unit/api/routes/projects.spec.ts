import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
const mockGetPool = vi.fn(() => mockPool);

/** Minimal express Router mock — records registered routes in .stack */
function createMockExpressRouter() {
  const stack: any[] = [];
  const routerInstance: any = { stack };

  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    routerInstance[method] = (path: string, ...handlers: Function[]) => {
      stack.push({
        route: {
          path,
          methods: { [method]: true },
          stack: handlers.map((handle) => ({ handle })),
        },
      });
      return routerInstance;
    };
  }

  routerInstance.use = vi.fn(() => routerInstance);
  return routerInstance;
}

function loadProjectsRouter() {
  const router = createMockExpressRouter();
  delete require.cache[projectsRoutePath];

  Module._load = (request: string, parent: any, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => router };
    }
    let resolved: string | null = null;
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch {
      // ignore unresolvable requests
    }
    if (resolved === databaseModulePath) {
      return { getPool: mockGetPool };
    }
    return originalLoad(request, parent, isMain);
  };

  require(projectsRoutePath);
  return router;
}

function getDeleteHandler(router: any): (...args: any[]) => Promise<void> {
  const layer = router.stack.find(
    (l: any) => l.route?.path === '/:id' && l.route?.methods?.delete,
  );
  if (!layer) {
    throw new Error('DELETE /:id route handler not found in projects router');
  }
  return layer.route.stack[0].handle;
}

describe('projects router - DELETE /:id', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  it('deletes a project and returns the deleted id', async () => {
    // Arrange
    const router = loadProjectsRouter();
    const handler = getDeleteHandler(router);
    const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockQuery.mockResolvedValue({ rows: [{ id: projectId }] });

    const req = { params: { id: projectId } };
    const res = { json: vi.fn() };
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith({ message: 'Project deleted', id: projectId });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when project does not exist', async () => {
    // Arrange
    const router = loadProjectsRouter();
    const handler = getDeleteHandler(router);
    mockQuery.mockResolvedValue({ rows: [] });

    const req = { params: { id: 'non-existent-id' } };
    const res = { json: vi.fn() };
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toBe('Project not found');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('uses a single DELETE query — DB FK CASCADE removes tasks and comments', async () => {
    // Arrange
    const router = loadProjectsRouter();
    const handler = getDeleteHandler(router);
    const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockQuery.mockResolvedValue({ rows: [{ id: projectId }] });

    const req = { params: { id: projectId } };
    const res = { json: vi.fn() };
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert: only one DB query; cascade is handled by FK constraints in schema
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect((sql as string).toUpperCase()).toContain('DELETE FROM PROJECTS');
    expect(params).toEqual([projectId]);
  });

  it('forwards database errors to next()', async () => {
    // Arrange
    const router = loadProjectsRouter();
    const handler = getDeleteHandler(router);
    const dbError = new Error('Connection failed');
    mockQuery.mockRejectedValue(dbError);

    const req = { params: { id: 'some-id' } };
    const res = { json: vi.fn() };
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.json).not.toHaveBeenCalled();
  });
});
