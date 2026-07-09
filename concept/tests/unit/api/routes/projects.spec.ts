/**
 * Unit tests for /api/projects route handlers.
 *
 * Covers:
 *  - POST validation: missing name, whitespace-only name
 *  - GET /:id 404 when project does not exist
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');
const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');

// ─── Minimal Express mock ────────────────────────────────────────────────────

interface RouteEntry {
  method: string;
  path: string;
  handler: (req: unknown, res: unknown, next: (err?: unknown) => void) => Promise<void>;
}

class MockRouter {
  stack: RouteEntry[] = [];
  private _add(method: string, path: string, handler: RouteEntry['handler']) {
    this.stack.push({ method, path, handler });
  }
  get(path: string, h: RouteEntry['handler']) { this._add('GET', path, h); }
  post(path: string, h: RouteEntry['handler']) { this._add('POST', path, h); }
  put(path: string, h: RouteEntry['handler']) { this._add('PUT', path, h); }
  patch(path: string, h: RouteEntry['handler']) { this._add('PATCH', path, h); }
  delete(path: string, h: RouteEntry['handler']) { this._add('DELETE', path, h); }
}

// ─── Shared mocks ────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
const mockGetPool = vi.fn().mockReturnValue(mockPool);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReqRes(overrides: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}) {
  const req = { body: overrides.body ?? {}, params: overrides.params ?? {} };
  const mockJson = vi.fn();
  const mockStatus = vi.fn().mockReturnValue({ json: mockJson });
  const res = { json: mockJson, status: mockStatus };
  const next = vi.fn();
  return { req, res, next };
}

function findHandler(router: MockRouter, method: string, path: string) {
  const entry = router.stack.find(r => r.method === method && r.path === path);
  if (!entry) throw new Error(`No handler for ${method} ${path}`);
  return entry.handler;
}

async function loadProjectsRouter(): Promise<MockRouter> {
  delete require.cache[projectsRoutePath];

  const mockRouter = new MockRouter();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    return originalLoad(request, parent, isMain);
  };

  require.cache[databaseModulePath] = {
    id: databaseModulePath,
    filename: databaseModulePath,
    loaded: true,
    exports: { getPool: mockGetPool },
    children: [],
    paths: [],
  };

  require(projectsRoutePath);
  return mockRouter;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('projects routes', () => {
  let router: MockRouter;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadProjectsRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[projectsRoutePath];
    delete require.cache[databaseModulePath];
  });

  // ── POST / ───────────────────────────────────────────────────────────────

  describe('POST /', () => {
    it('calls next with 400 when name is absent from body', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({ body: {} });
      const handler = findHandler(router, 'POST', '/');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/name/i);
    });

    it('calls next with 400 when name is whitespace only', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({ body: { name: '   ' } });
      const handler = findHandler(router, 'POST', '/');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('calls next with 400 when name is an empty string', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({ body: { name: '' } });
      const handler = findHandler(router, 'POST', '/');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('inserts with trimmed name and no description when description is omitted', async () => {
      // Arrange
      const newProject = { id: '1', name: 'Alpha', description: null, created_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [newProject] });
      const { req, res, next } = makeReqRes({ body: { name: '  Alpha  ' } });
      const handler = findHandler(router, 'POST', '/');

      // Act
      await handler(req, res, next);

      // Assert — next should not be called with an error
      const errorCalls = (next as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[0]);
      expect(errorCalls).toHaveLength(0);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['Alpha', null],
      );
    });
  });

  // ── GET /:id ─────────────────────────────────────────────────────────────

  describe('GET /:id', () => {
    it('calls next with 404 when project is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeReqRes({ params: { id: '999' } });
      const handler = findHandler(router, 'GET', '/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
    });

    it('returns the project when found', async () => {
      // Arrange
      const project = { id: '1', name: 'Alpha', description: 'Desc' };
      mockQuery.mockResolvedValueOnce({ rows: [project] });
      const { req, res, next } = makeReqRes({ params: { id: '1' } });
      const handler = findHandler(router, 'GET', '/:id');

      // Act
      await handler(req, res, next);

      // Assert
      expect((res as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith(project);
    });
  });
});
