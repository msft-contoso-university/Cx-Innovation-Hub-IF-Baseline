import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const realExpress = require('express');

const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');
const databaseServicePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();

function createMockRes() {
  const res: {
    statusCode: number;
    body?: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => typeof res;
  } = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function loadProjectsRouter() {
  delete require.cache[projectsRoutePath];
  delete require.cache[databaseServicePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return realExpress;
    }
    if (request === '../services/database' || request === './services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(projectsRoutePath);
}

function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

describe('projects routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  it('POST / rejects a missing project name', async () => {
    // Arrange
    const router = loadProjectsRouter();
    const handler = findHandler(router, 'post', '/');
    const req = { body: { name: '   ' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST / creates a project with a trimmed name', async () => {
    // Arrange
    const router = loadProjectsRouter();
    const handler = findHandler(router, 'post', '/');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'New Project' }] });
    const req = { body: { name: '  New Project  ', description: 'desc' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['New Project', 'desc']);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 1, name: 'New Project' });
  });

  it('GET /:id returns 404 when the project does not exist', async () => {
    // Arrange
    const router = loadProjectsRouter();
    const handler = findHandler(router, 'get', '/:id');
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: '999' } };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next.mock.calls[0][0].status).toBe(404);
  });
});
