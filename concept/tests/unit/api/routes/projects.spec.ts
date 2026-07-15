import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');

// Captured route handlers registered on the mock Express router
const handlers: Record<string, (...args: any[]) => Promise<void>> = {};

// Shared mock pool - reassigned before each test
let mockPool: { query: ReturnType<typeof vi.fn> };

function makeRouterStub() {
  const stub: any = {
    get: (path: string, fn: (...a: any[]) => any) => { handlers[`GET ${path}`] = fn; return stub; },
    post: (path: string, fn: (...a: any[]) => any) => { handlers[`POST ${path}`] = fn; return stub; },
    put: (path: string, fn: (...a: any[]) => any) => { handlers[`PUT ${path}`] = fn; return stub; },
    patch: (path: string, fn: (...a: any[]) => any) => { handlers[`PATCH ${path}`] = fn; return stub; },
    delete: (path: string, fn: (...a: any[]) => any) => { handlers[`DELETE ${path}`] = fn; return stub; },
  };
  return stub;
}

beforeAll(() => {
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return { Router: makeRouterStub };
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[projectsRoutePath];
  require(projectsRoutePath);

  Module._load = originalLoad;
});

afterAll(() => {
  Module._load = originalLoad;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPool = { query: vi.fn() };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res: any = { status: vi.fn(() => res), json: vi.fn() };
  return res;
}

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------
describe('GET / (list projects)', () => {
  it('returns all projects on success', async () => {
    // Arrange
    const rows = [{ id: '1', name: 'Alpha', task_count: 5, done_count: 2 }];
    mockPool.query = vi.fn().mockResolvedValue({ rows });
    const req: any = { params: {}, body: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['GET /']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(rows);
  });

  it('calls next with db error when query fails', async () => {
    // Arrange
    const dbErr = new Error('DB down');
    mockPool.query = vi.fn().mockRejectedValue(dbErr);
    const req: any = { params: {}, body: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['GET /']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbErr);
  });
});

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------
describe('GET /:id (get project by id)', () => {
  it('returns 404 when project is not found', async () => {
    // Arrange
    mockPool.query = vi.fn().mockResolvedValue({ rows: [] });
    const req: any = { params: { id: 'missing-uuid' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['GET /:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('returns the project when found', async () => {
    // Arrange
    const project = { id: 'abc', name: 'Beta' };
    mockPool.query = vi.fn().mockResolvedValue({ rows: [project] });
    const req: any = { params: { id: 'abc' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['GET /:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(project);
  });
});

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------
describe('POST / (create project)', () => {
  it('returns 400 when name is missing', async () => {
    // Arrange
    const req: any = { params: {}, body: {} };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/name is required/i);
  });

  it('returns 400 when name is whitespace only', async () => {
    // Arrange
    const req: any = { params: {}, body: { name: '   ' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('creates a project and returns 201 with the new row', async () => {
    // Arrange
    const newProject = { id: 'new-id', name: 'Gamma', description: null };
    mockPool.query = vi.fn().mockResolvedValue({ rows: [newProject] });
    const req: any = { params: {}, body: { name: 'Gamma' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newProject);
  });

  it('trims whitespace from name before inserting', async () => {
    // Arrange
    const newProject = { id: 'new-id', name: 'Trimmed', description: null };
    mockPool.query = vi.fn().mockResolvedValue({ rows: [newProject] });
    const req: any = { params: {}, body: { name: '  Trimmed  ' } };
    const res = makeRes();
    const next = vi.fn();

    // Act
    await handlers['POST /']!(req, res, next);

    // Assert
    const [, params] = mockPool.query.mock.calls[0];
    expect(params[0]).toBe('Trimmed');
  });
});
