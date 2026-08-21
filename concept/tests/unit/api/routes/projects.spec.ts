import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const projectsModulePath = require.resolve('../../../../apps/api/src/routes/projects.js');

const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

function loadProjectsRouter() {
  delete require.cache[projectsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }

    return originalLoad(request, parent, isMain);
  };

  return require(projectsModulePath);
}

function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createMockRes() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('projects routes', () => {
  let router: any;

  beforeEach(() => {
    vi.clearAllMocks();
    router = loadProjectsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  describe('POST /', () => {
    it('rejects a missing project name with a 400 error', async () => {
      // Arrange
      const handler = getHandler(router, 'post', '/');
      const req = { body: {} };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, message: 'Project name is required' })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only project name with a 400 error', async () => {
      // Arrange
      const handler = getHandler(router, 'post', '/');
      const req = { body: { name: '   ' } };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('creates a project with a trimmed name and optional description', async () => {
      // Arrange
      const handler = getHandler(router, 'post', '/');
      const req = { body: { name: '  My Project  ' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'My Project' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['My Project', null]
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 'p1', name: 'My Project' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('GET /:id', () => {
    it('returns a 404 error when the project does not exist', async () => {
      // Arrange
      const handler = getHandler(router, 'get', '/:id');
      const req = { params: { id: 'missing' } };
      const res = createMockRes();
      const next = vi.fn();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, message: 'Project not found' })
      );
    });
  });
});
