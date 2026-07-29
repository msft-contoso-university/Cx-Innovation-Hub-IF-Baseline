/**
 * Unit tests for projects routes.
 *
 * Focus: input validation (name required) and 404 handling.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsModulePath = require.resolve('../../../../apps/api/src/routes/projects.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

async function loadProjectsRouter() {
  delete require.cache[projectsModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databaseModulePath) {
        return { getPool: mockGetPool };
      }
    } catch {
      // ignore
    }
    return originalLoad(request, parent, isMain);
  };

  return require(projectsModulePath);
}

type RouteResult =
  | { status: number; body: unknown; err?: undefined }
  | { err: unknown; status?: undefined; body?: undefined };

function callRoute(
  router: any,
  method: string,
  url: string,
  opts: { body?: Record<string, unknown> } = {},
): Promise<RouteResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v: RouteResult) => {
      if (!settled) { settled = true; resolve(v); }
    };

    const res: any = {
      _status: 200,
      status(code: number) { this._status = code; return this; },
      json(body: unknown) { settle({ status: this._status, body }); return this; },
    };

    const next = (err?: unknown) => settle(err ? { err } : { status: 200, body: null });

    router.handle(
      {
        method: method.toUpperCase(),
        url,
        originalUrl: url,
        params: {},
        body: opts.body ?? {},
        headers: {},
      },
      res,
      next,
    );
  });
}

describe('projects routes', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadProjectsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ── GET /projects ────────────────────────────────────────────────────────

  describe('GET /', () => {
    it('returns 200 with project rows', async () => {
      const projects = [{ id: 'p1', name: 'Alpha', task_count: 3, done_count: 1 }];
      mockQuery.mockResolvedValueOnce({ rows: projects });

      const result = await callRoute(router, 'GET', '/');

      expect(result.status).toBe(200);
      expect(result.body).toEqual(projects);
    });

    it('calls next with error when the database throws', async () => {
      const dbError = new Error('DB error');
      mockQuery.mockRejectedValueOnce(dbError);

      const result = await callRoute(router, 'GET', '/');

      expect((result as any).err).toBe(dbError);
    });
  });

  // ── GET /projects/:id ────────────────────────────────────────────────────

  describe('GET /:id', () => {
    it('returns 200 with the project when found', async () => {
      const project = { id: 'p-1', name: 'Beta' };
      mockQuery.mockResolvedValueOnce({ rows: [project] });

      const result = await callRoute(router, 'GET', '/p-1');

      expect(result.status).toBe(200);
      expect((result.body as any).name).toBe('Beta');
    });

    it('returns 404 when the project does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await callRoute(router, 'GET', '/missing-id');

      expect((result as any).err.status).toBe(404);
      expect((result as any).err.message).toMatch(/not found/i);
    });
  });

  // ── POST /projects ────────────────────────────────────────────────────────

  describe('POST /', () => {
    it('returns 400 when name is missing from the body', async () => {
      const result = await callRoute(router, 'POST', '/', {
        body: { description: 'No name supplied' },
      });

      expect((result as any).err.status).toBe(400);
      expect((result as any).err.message).toMatch(/name/i);
    });

    it('returns 400 when name is an empty string', async () => {
      const result = await callRoute(router, 'POST', '/', {
        body: { name: '' },
      });

      expect((result as any).err.status).toBe(400);
    });

    it('returns 400 when name is whitespace only', async () => {
      const result = await callRoute(router, 'POST', '/', {
        body: { name: '   ' },
      });

      expect((result as any).err.status).toBe(400);
    });

    it('returns 201 with the created project on success', async () => {
      const created = { id: 'new-p', name: 'Gamma', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [created] });

      const result = await callRoute(router, 'POST', '/', {
        body: { name: 'Gamma' },
      });

      expect(result.status).toBe(201);
      expect((result.body as any).name).toBe('Gamma');
    });

    it('trims whitespace from the project name before inserting', async () => {
      const created = { id: 'new-p', name: 'Trimmed', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [created] });

      await callRoute(router, 'POST', '/', { body: { name: '  Trimmed  ' } });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('Trimmed');
    });
  });
});
