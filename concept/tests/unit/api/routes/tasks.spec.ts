import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

function createError(status: number, message: string) {
  const err = new Error(message);
  (err as any).status = status;
  return err;
}

function loadTasksRouter() {
  delete require.cache[tasksModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    if (request === '../middleware/errorHandler') {
      return { createError };
    }
    return originalLoad(request, parent, isMain);
  };

  return require(tasksModulePath);
}

function getHandler(router: any, method: string, routePath: string) {
  const layer = router.stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods[method]
  );
  return layer?.route.stack[0].handle;
}

function makeMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('POST /api/projects/:projectId/tasks — input validation', () => {
  let postHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const router = loadTasksRouter();
    postHandler = getHandler(router, 'post', '/projects/:projectId/tasks');
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ── title: required ─────────────────────────────────────────────────────────

  it('returns 400 with "Title is required" when title is missing', async () => {
    const req = { params: { projectId: 'proj-1' }, body: {} };
    const next = vi.fn();

    await postHandler(req, makeMockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Title is required' })
    );
  });

  it('returns 400 with "Title is required" when title is empty string', async () => {
    const req = { params: { projectId: 'proj-1' }, body: { title: '' } };
    const next = vi.fn();

    await postHandler(req, makeMockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Title is required' })
    );
  });

  it('returns 400 with "Title is required" when title is only whitespace', async () => {
    const req = { params: { projectId: 'proj-1' }, body: { title: '   ' } };
    const next = vi.fn();

    await postHandler(req, makeMockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Title is required' })
    );
  });

  // ── title: max length ────────────────────────────────────────────────────────

  it('returns 400 with "Title must be 200 characters or less" when title exceeds 200 chars', async () => {
    const req = { params: { projectId: 'proj-1' }, body: { title: 'a'.repeat(201) } };
    const next = vi.fn();

    await postHandler(req, makeMockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Title must be 200 characters or less' })
    );
  });

  it('accepts a title of exactly 200 characters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })    // project exists
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })      // next position
      .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })     // insert
      .mockResolvedValueOnce({ rows: [{ id: 'task-1', title: 'a'.repeat(200) }] }); // fetch

    const req = { params: { projectId: 'proj-1' }, body: { title: 'a'.repeat(200) } };
    const next = vi.fn();
    const res = makeMockRes();

    await postHandler(req, res, next);

    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // ── description: max length ──────────────────────────────────────────────────

  it('returns 400 with "Description must be 1000 characters or less" when description exceeds 1000 chars', async () => {
    const req = {
      params: { projectId: 'proj-1' },
      body: { title: 'Valid Title', description: 'x'.repeat(1001) },
    };
    const next = vi.fn();

    await postHandler(req, makeMockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Description must be 1000 characters or less' })
    );
  });

  it('accepts a description of exactly 1000 characters', async () => {
    const taskData = { id: 'task-1', title: 'Valid Title', description: 'x'.repeat(1000) };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
      .mockResolvedValueOnce({ rows: [taskData] });

    const req = {
      params: { projectId: 'proj-1' },
      body: { title: 'Valid Title', description: 'x'.repeat(1000) },
    };
    const next = vi.fn();
    const res = makeMockRes();

    await postHandler(req, res, next);

    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // ── project existence ────────────────────────────────────────────────────────

  it('returns 404 with "Project not found" when projectId does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no project found

    const req = { params: { projectId: 'nonexistent' }, body: { title: 'Valid Title' } };
    const next = vi.fn();

    await postHandler(req, makeMockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Project not found' })
    );
  });

  // ── happy path ───────────────────────────────────────────────────────────────

  it('creates task and returns 201 with task data on valid input', async () => {
    const taskData = { id: 'task-1', title: 'New Task', project_id: 'proj-1' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
      .mockResolvedValueOnce({ rows: [taskData] });

    const req = { params: { projectId: 'proj-1' }, body: { title: 'New Task' } };
    const next = vi.fn();
    const res = makeMockRes();

    await postHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(taskData);
    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
  });

  it('trims whitespace from title before inserting', async () => {
    const taskData = { id: 'task-1', title: 'Trimmed Title' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
      .mockResolvedValueOnce({ rows: [taskData] });

    const req = { params: { projectId: 'proj-1' }, body: { title: '  Trimmed Title  ' } };
    const next = vi.fn();

    await postHandler(req, makeMockRes(), next);

    const insertCall = mockQuery.mock.calls.find((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes('INSERT INTO tasks')
    );
    expect(insertCall?.[1][1]).toBe('Trimmed Title');
  });
});
