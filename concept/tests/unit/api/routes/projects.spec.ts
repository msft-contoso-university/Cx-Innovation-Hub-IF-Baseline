import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const projectsModulePath = require.resolve('../../../../apps/api/src/routes/projects.js');

const mockQuery = vi.fn();

function createMockRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

async function loadProjectsRouter() {
  delete require.cache[projectsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(projectsModulePath);
}

describe('projects routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('GET /:id', () => {
    it('returns a 404 error when the project does not exist', async () => {
      // Arrange
      const router = await loadProjectsRouter();
      const handler = getHandler(router, 'get', '/:id');
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = { params: { id: 'missing' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    it('returns the project when found', async () => {
      // Arrange
      const router = await loadProjectsRouter();
      const handler = getHandler(router, 'get', '/:id');
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Project One' }] });
      const req = { params: { id: 'p1' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 'p1', name: 'Project One' });
    });
  });

  describe('POST /', () => {
    it('rejects a missing name with a 400 error', async () => {
      // Arrange
      const router = await loadProjectsRouter();
      const handler = getHandler(router, 'post', '/');
      const req = { body: { name: '   ' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates a project and trims the name', async () => {
      // Arrange
      const router = await loadProjectsRouter();
      const handler = getHandler(router, 'post', '/');
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'New Project', description: null }] });
      const req = { body: { name: '  New Project  ' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(mockQuery.mock.calls[0][1]).toEqual(['New Project', null]);
      expect(res.body).toEqual({ id: 'p1', name: 'New Project', description: null });
    });
  });
});
