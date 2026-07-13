/**
 * Unit tests for projects route handlers.
 *
 * Validates input validation and basic error-path behaviour without a live DB.
 * The database module is intercepted via Module._load so tests remain isolated.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// Resolve the paths we need so Module._load can intercept them
const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');
const databasePath = require.resolve('../../../../apps/api/src/services/database.js');
// Resolve express and errorHandler from the test package so route files can load
const expressModule = require('express');
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

type MockQuery = ReturnType<typeof vi.fn>;

function mockGetPool(queryImpl: MockQuery) {
  return () => ({ query: queryImpl });
}

function loadProjectsRouter(queryImpl: MockQuery) {
  delete require.cache[projectsRoutePath];
  delete require.cache[databasePath];
  delete require.cache[errorHandlerPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return expressModule;
    }
    if (request === '../services/database' || request === databasePath) {
      return { getPool: mockGetPool(queryImpl) };
    }
    if (request === '../middleware/errorHandler' || request === errorHandlerPath) {
      return originalLoad(errorHandlerPath, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };

  return require(projectsRoutePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/projects', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  it('returns 400 when name is missing', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadProjectsRouter(query);
    const req = { body: {}, params: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    // Act — find the POST "/" handler and call it
    const postLayer = router.stack.find(
      (l: { route?: { methods: Record<string, boolean>; path: string } }) =>
        l.route?.methods?.post && l.route?.path === '/',
    );
    await postLayer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/name/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 when name is whitespace-only', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadProjectsRouter(query);
    const req = { body: { name: '   ' }, params: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    const postLayer = router.stack.find(
      (l: { route?: { methods: Record<string, boolean>; path: string } }) =>
        l.route?.methods?.post && l.route?.path === '/',
    );
    await postLayer.route.stack[0].handle(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number };
    expect(err.status).toBe(400);
  });

  it('creates a project and returns 201 when name is valid', async () => {
    // Arrange
    const newProject = { id: 'uuid-1', name: 'Alpha', description: null };
    const query = vi.fn().mockResolvedValue({ rows: [newProject] });
    const router = loadProjectsRouter(query);
    const req = { body: { name: 'Alpha' }, params: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    const postLayer = router.stack.find(
      (l: { route?: { methods: Record<string, boolean>; path: string } }) =>
        l.route?.methods?.post && l.route?.path === '/',
    );
    await postLayer.route.stack[0].handle(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newProject);
  });

  it('trims leading/trailing whitespace from the project name', async () => {
    // Arrange
    const newProject = { id: 'uuid-2', name: 'Trimmed', description: null };
    const query = vi.fn().mockResolvedValue({ rows: [newProject] });
    const router = loadProjectsRouter(query);
    const req = { body: { name: '  Trimmed  ' }, params: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    const postLayer = router.stack.find(
      (l: { route?: { methods: Record<string, boolean>; path: string } }) =>
        l.route?.methods?.post && l.route?.path === '/',
    );
    await postLayer.route.stack[0].handle(req, res, next);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      ['Trimmed', null],
    );
  });
});

describe('GET /api/projects/:id', () => {
  afterEach(() => {
    Module._load = originalLoad;
    vi.clearAllMocks();
  });

  it('returns 404 when project is not found', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadProjectsRouter(query);
    const req = { params: { id: 'non-existent' }, body: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    const getByIdLayer = router.stack.find(
      (l: { route?: { methods: Record<string, boolean>; path: string } }) =>
        l.route?.methods?.get && l.route?.path === '/:id',
    );
    await getByIdLayer.route.stack[0].handle(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('returns the project when found', async () => {
    // Arrange
    const project = { id: 'p1', name: 'Beta', description: 'desc' };
    const query = vi.fn().mockResolvedValue({ rows: [project] });
    const router = loadProjectsRouter(query);
    const req = { params: { id: 'p1' }, body: {}, headers: {} } as Record<string, unknown>;
    const res = makeRes();
    const next = vi.fn();

    const getByIdLayer = router.stack.find(
      (l: { route?: { methods: Record<string, boolean>; path: string } }) =>
        l.route?.methods?.get && l.route?.path === '/:id',
    );
    await getByIdLayer.route.stack[0].handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(project);
  });
});
