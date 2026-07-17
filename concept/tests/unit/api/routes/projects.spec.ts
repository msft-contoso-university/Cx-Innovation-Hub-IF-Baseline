/**
 * Unit tests for the projects router.
 *
 * Key behaviours verified:
 *  - GET  /            — returns all projects
 *  - GET  /:id         — returns single project, 404 when missing
 *  - POST /            — validates name, trims whitespace, returns 201
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let mockQuery: ReturnType<typeof vi.fn>;

function setupMocks() {
  mockQuery = vi.fn();
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database' || request.endsWith('/services/database.js')) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };
}

function buildRouter() {
  const projectsPath = require.resolve('../../../../apps/api/src/routes/projects.js');
  delete require.cache[projectsPath];
  return require(projectsPath);
}

function buildMockRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 200;
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function findLayer(
  router: ReturnType<typeof buildRouter>,
  method: string,
  path: string,
) {
  return router.stack.find(
    (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
      l.route?.path === path && l.route?.methods?.[method.toLowerCase()],
  );
}

beforeEach(() => {
  setupMocks();
});

afterEach(() => {
  Module._load = originalLoad;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe('GET / (list projects)', () => {
  it('returns 200 with all project rows', async () => {
    // Arrange
    const router = buildRouter();
    const fakeProjects = [{ id: 'p1', name: 'Alpha', task_count: 3, done_count: 1 }];
    mockQuery.mockResolvedValue({ rows: fakeProjects });
    const req = { params: {}, body: {} };
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'GET', '/');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(fakeProjects);
  });

  it('passes database errors to next()', async () => {
    const router = buildRouter();
    const dbError = new Error('timeout');
    mockQuery.mockRejectedValue(dbError);
    const req = { params: {}, body: {} };
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'GET', '/');
    await layer.route.stack[0].handle(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });
});

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------

describe('GET /:id (get project by id)', () => {
  it('returns 200 with the project when it exists', async () => {
    // Arrange
    const router = buildRouter();
    const fakeProject = { id: 'p1', name: 'Alpha', description: null };
    mockQuery.mockResolvedValue({ rows: [fakeProject] });
    const req = { params: { id: 'p1' }, body: {} };
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'GET', '/:id');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(fakeProject);
  });

  it('returns 404 when project is not found', async () => {
    // Arrange
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'nonexistent' }, body: {} };
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'GET', '/:id');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(next.mock.calls[0][0].message).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

describe('POST / (create project)', () => {
  it('returns 400 when name is missing', async () => {
    // Arrange
    const router = buildRouter();
    const req = { params: {}, body: {} };
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'POST', '/');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/name/i);
  });

  it('returns 400 when name is whitespace only', async () => {
    const router = buildRouter();
    const req = { params: {}, body: { name: '   ' } };
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'POST', '/');
    await layer.route.stack[0].handle(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('returns 201 with created project on success', async () => {
    // Arrange
    const router = buildRouter();
    const createdProject = { id: 'p2', name: 'Beta', description: 'Desc' };
    mockQuery.mockResolvedValue({ rows: [createdProject] });
    const req = { params: {}, body: { name: '  Beta  ', description: 'Desc' } };
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'POST', '/');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdProject);
  });

  it('trims whitespace from the project name before inserting', async () => {
    // Arrange
    const router = buildRouter();
    mockQuery.mockResolvedValue({ rows: [{ id: 'p3', name: 'Trimmed' }] });
    const req = { params: {}, body: { name: '  Trimmed  ' } };
    const res = buildMockRes();
    const next = vi.fn();

    const layer = findLayer(router, 'POST', '/');

    // Act
    await layer.route.stack[0].handle(req, res, next);

    // Assert — first arg to the first query call should contain the trimmed name
    const queryArgs = mockQuery.mock.calls[0];
    expect(queryArgs[1]).toContain('Trimmed');
    expect(queryArgs[1]).not.toContain('  Trimmed  ');
  });
});
