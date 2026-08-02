import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');

const mockQuery = vi.fn();

function createExpressMock() {
  function Router() {
    const stack: any[] = [];
    const addRoute = (method: string) => (path: string, handler: Function) => {
      const existing = stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
      if (existing) {
        existing.route.stack.push({ handle: handler });
      } else {
        stack.push({ route: { path, methods: { [method]: true }, stack: [{ handle: handler }] } });
      }
    };
    const r: any = { stack, get: addRoute('get'), post: addRoute('post'), put: addRoute('put'), patch: addRoute('patch'), delete: addRoute('delete') };
    return r;
  }
  return { Router };
}

async function loadProjectsRouter() {
  delete require.cache[projectsRoutePath];
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return createExpressMock();
    if (request === '../services/database' || request.endsWith('services/database.js')) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };
  return require(projectsRoutePath);
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnThis();
  return { json, status, _json: json, _status: status } as any;
}

describe('POST /api/projects', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 400 when name is missing', async () => {
    // Arrange
    const router = await loadProjectsRouter();
    const postHandler = router.stack.find((l: any) => l.route?.methods?.post)?.route?.stack[0]?.handle;
    const next = vi.fn();

    // Act
    await postHandler({ body: {} }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project name is required' }));
    expect((next.mock.calls[0][0] as any).status).toBe(400);
  });

  it('returns 400 when name is blank/whitespace only', async () => {
    // Arrange
    const router = await loadProjectsRouter();
    const postHandler = router.stack.find((l: any) => l.route?.methods?.post)?.route?.stack[0]?.handle;
    const next = vi.fn();

    // Act
    await postHandler({ body: { name: '   ' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project name is required' }));
  });

  it('creates a project and returns 201 when name is valid', async () => {
    // Arrange
    const router = await loadProjectsRouter();
    const postHandler = router.stack.find((l: any) => l.route?.methods?.post)?.route?.stack[0]?.handle;
    const next = vi.fn();
    const res = makeRes();
    const newProject = { id: 'abc', name: 'My Project', description: null, created_at: '2024-01-01' };
    mockQuery.mockResolvedValueOnce({ rows: [newProject] });

    // Act
    await postHandler({ body: { name: 'My Project' } }, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newProject);
    expect(next).not.toHaveBeenCalled();
  });

  it('trims whitespace from project name before inserting', async () => {
    // Arrange
    const router = await loadProjectsRouter();
    const postHandler = router.stack.find((l: any) => l.route?.methods?.post)?.route?.stack[0]?.handle;
    const next = vi.fn();
    const res = makeRes();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1', name: 'Trimmed' }] });

    // Act
    await postHandler({ body: { name: '  Trimmed  ' } }, res, next);

    // Assert
    const [sql, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('Trimmed');
  });

  it('passes description as null when omitted', async () => {
    // Arrange
    const router = await loadProjectsRouter();
    const postHandler = router.stack.find((l: any) => l.route?.methods?.post)?.route?.stack[0]?.handle;
    const next = vi.fn();
    const res = makeRes();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1', name: 'No Desc' }] });

    // Act
    await postHandler({ body: { name: 'No Desc' } }, res, next);

    // Assert
    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBeNull();
  });

  it('forwards DB errors to next', async () => {
    // Arrange
    const router = await loadProjectsRouter();
    const postHandler = router.stack.find((l: any) => l.route?.methods?.post)?.route?.stack[0]?.handle;
    const next = vi.fn();
    const dbError = new Error('DB failure');
    mockQuery.mockRejectedValueOnce(dbError);

    // Act
    await postHandler({ body: { name: 'Valid' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});

describe('GET /api/projects/:id', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { Module._load = originalLoad; });

  it('returns 404 when project is not found', async () => {
    // Arrange
    const router = await loadProjectsRouter();
    const getByIdHandler = router.stack.find(
      (l: any) => l.route?.path === '/:id' && l.route?.methods?.get
    )?.route?.stack[0]?.handle;
    const next = vi.fn();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    await getByIdHandler({ params: { id: 'nonexistent' } }, makeRes(), next);

    // Assert
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project not found' }));
    expect((next.mock.calls[0][0] as any).status).toBe(404);
  });
});
