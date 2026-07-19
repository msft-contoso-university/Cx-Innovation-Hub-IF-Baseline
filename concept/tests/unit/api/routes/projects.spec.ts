/**
 * Unit tests for the projects route handlers.
 *
 * Uses a Module._load intercept to mock the database service and a minimal
 * express Router mock so that route handlers can be called directly without
 * starting an HTTP server.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const dir = dirname(fileURLToPath(import.meta.url));
const projectsRouterPath = resolve(dir, '../../../../apps/api/src/routes/projects.js');

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

/** Holds the route handlers extracted when the module is loaded. */
let handlers: Record<string, Function> = {};

function createMockRouter() {
  const router: any = {};
  handlers = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    router[method] = (path: string, handler: Function) => {
      handlers[`${method.toUpperCase()} ${path}`] = handler;
      return router;
    };
  }
  return router;
}

function loadRouter() {
  delete require.cache[projectsRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return { Router: createMockRouter };
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  require(projectsRouterPath);
}

beforeEach(() => {
  vi.clearAllMocks();
  loadRouter();
});

afterEach(() => {
  Module._load = originalLoad;
});

// ---------------------------------------------------------------------------
// POST /api/projects
// ---------------------------------------------------------------------------
describe('POST /api/projects', () => {
  it('calls next with 400 when name is missing from body', async () => {
    // Arrange
    const req = { body: {}, params: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, message: 'Project name is required' });
  });

  it('calls next with 400 when name is whitespace-only', async () => {
    // Arrange
    const req = { body: { name: '   ' }, params: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
  });

  it('responds 201 with the created project when name is valid', async () => {
    // Arrange
    const newProject = { id: 'uuid-1', name: 'Alpha', description: null, created_at: new Date().toISOString() };
    mockQuery.mockResolvedValueOnce({ rows: [newProject] });
    const req = { body: { name: 'Alpha' }, params: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newProject);
  });

  it('trims leading/trailing whitespace from the project name', async () => {
    // Arrange
    const newProject = { id: 'uuid-2', name: 'Beta', description: null };
    mockQuery.mockResolvedValueOnce({ rows: [newProject] });
    const req = { body: { name: '  Beta  ' }, params: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['POST /']!(req, res, next);

    // Assert – DB was called with trimmed name
    const [sql, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('Beta');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id
// ---------------------------------------------------------------------------
describe('GET /api/projects/:id', () => {
  it('calls next with 404 when the project does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: 'non-existent' }, body: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['GET /:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Project not found' });
  });

  it('responds with the project row when found', async () => {
    // Arrange
    const project = { id: 'uuid-1', name: 'Gamma', description: 'desc' };
    mockQuery.mockResolvedValueOnce({ rows: [project] });
    const req = { params: { id: 'uuid-1' }, body: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['GET /:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(project);
  });
});
