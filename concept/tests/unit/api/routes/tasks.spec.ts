/**
 * Unit tests for /api/tasks route handlers.
 *
 * Covers the highest-risk validation paths:
 *  - Title requirement for POST and PUT
 *  - VALID_STATUSES enforcement for PATCH /tasks/:id/status
 *  - Position requirement for PATCH /tasks/:id/status
 *  - 404 propagation when no row is returned
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');
const tasksRoutePath = require.resolve('../../../../apps/api/src/routes/tasks.js');

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
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}) {
  const req = {
    headers: overrides.headers ?? {},
    body: overrides.body ?? {},
    params: overrides.params ?? {},
  };
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

async function loadTasksRouter(): Promise<MockRouter> {
  delete require.cache[tasksRoutePath];

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

  require(tasksRoutePath);
  return mockRouter;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('tasks routes', () => {
  let router: MockRouter;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadTasksRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
    delete require.cache[tasksRoutePath];
    delete require.cache[databaseModulePath];
  });

  // ── POST /projects/:projectId/tasks ──────────────────────────────────────

  describe('POST /projects/:projectId/tasks', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        body: {},
        params: { projectId: '1' },
      });
      const handler = findHandler(router, 'POST', '/projects/:projectId/tasks');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/title/i);
    });

    it('calls next with 400 when title is whitespace only', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        body: { title: '   ' },
        params: { projectId: '1' },
      });
      const handler = findHandler(router, 'POST', '/projects/:projectId/tasks');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });
  });

  // ── PUT /tasks/:id ───────────────────────────────────────────────────────

  describe('PUT /tasks/:id', () => {
    it('calls next with 400 when title is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        body: { description: 'Some description' },
        params: { id: '1' },
      });
      const handler = findHandler(router, 'PUT', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/title/i);
    });

    it('calls next with 400 when title is empty string', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        body: { title: '' },
        params: { id: '1' },
      });
      const handler = findHandler(router, 'PUT', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows
      const { req, res, next } = makeReqRes({
        body: { title: 'Valid title' },
        params: { id: '999' },
      });
      const handler = findHandler(router, 'PUT', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
    });
  });

  // ── PATCH /tasks/:id/status ───────────────────────────────────────────────

  describe('PATCH /tasks/:id/status', () => {
    it('calls next with 400 for an unrecognised status value', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        body: { status: 'flying', position: 0 },
        params: { id: '1' },
      });
      const handler = findHandler(router, 'PATCH', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/invalid status/i);
    });

    it('calls next with 400 when status is missing', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        body: { position: 0 },
        params: { id: '1' },
      });
      const handler = findHandler(router, 'PATCH', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('calls next with 400 when position is undefined', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        body: { status: 'done' },
        params: { id: '1' },
      });
      const handler = findHandler(router, 'PATCH', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/position/i);
    });

    it('calls next with 400 when position is null', async () => {
      // Arrange
      const { req, res, next } = makeReqRes({
        body: { status: 'todo', position: null },
        params: { id: '1' },
      });
      const handler = findHandler(router, 'PATCH', '/tasks/:id/status');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('accepts all four valid status values without a 400 error', async () => {
      const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];

      for (const status of validStatuses) {
        vi.clearAllMocks();
        // Arrange: mock the UPDATE returning a task row, then the JOIN SELECT
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: '1', status }] })
          .mockResolvedValueOnce({ rows: [{ id: '1', status, assigned_user_name: null }] });

        const { req, res, next } = makeReqRes({
          body: { status, position: 0 },
          params: { id: '1' },
        });
        const handler = findHandler(router, 'PATCH', '/tasks/:id/status');

        // Act
        await handler(req, res, next);

        // Assert — next should NOT be called with an error for any valid status
        const calls = (next as ReturnType<typeof vi.fn>).mock.calls;
        const errorCalls = calls.filter(c => c[0]);
        expect(errorCalls).toHaveLength(0);
      }
    });
  });

  // ── DELETE /tasks/:id ─────────────────────────────────────────────────────

  describe('DELETE /tasks/:id', () => {
    it('calls next with 404 when task is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = makeReqRes({ params: { id: '999' } });
      const handler = findHandler(router, 'DELETE', '/tasks/:id');

      // Act
      await handler(req, res, next);

      // Assert
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
    });
  });
});
