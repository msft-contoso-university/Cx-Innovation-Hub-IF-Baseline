/**
 * Unit tests for concept/apps/api/src/routes/projects.js
 *
 * Covers input-validation paths (no DB call needed for those) and the 404
 * "project not found" branch using a mocked database pool.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Load (or reload) the projects router with a given mock getPool. */
async function loadProjectsRouter(mockGetPool: () => { query: ReturnType<typeof vi.fn> }) {
  delete require.cache[projectsRoutePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    if (request === '../middleware/errorHandler') {
      return originalLoad(
        require.resolve('../../../../apps/api/src/middleware/errorHandler.js'),
        parent,
        isMain,
      );
    }
    return originalLoad(request, parent, isMain);
  };

  return require(projectsRoutePath);
}

/** Fire a request through the Express router and collect the response. */
function routerRequest(
  router: { handle: Function },
  method: string,
  url: string,
  opts: { body?: Record<string, unknown>; params?: Record<string, string> } = {},
): Promise<{ status: number | null; body: unknown; nextErr: unknown }> {
  return new Promise((resolve) => {
    let capturedStatus: number | null = null;
    let capturedBody: unknown = null;
    let nextErr: unknown = null;

    const req: Record<string, unknown> = {
      method,
      url,
      path: url,
      headers: {},
      body: opts.body ?? {},
      params: opts.params ?? {},
    };
    const res = {
      status: vi.fn().mockImplementation((s: number) => { capturedStatus = s; return res; }),
      json: vi.fn().mockImplementation((b: unknown) => { capturedBody = b; }),
    };
    const next = vi.fn().mockImplementation((err?: unknown) => {
      nextErr = err;
      resolve({ status: capturedStatus, body: capturedBody, nextErr });
    });

    // The res.json path resolves synchronously; wrap in a timeout to cover both.
    const original_json = res.json.getMockImplementation()!;
    res.json.mockImplementation((b: unknown) => {
      capturedBody = b;
      resolve({ status: capturedStatus, body: capturedBody, nextErr: null });
    });

    router.handle(req, res, next);
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('POST /api/projects — input validation', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('calls next with 400 when name is absent', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadProjectsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'POST', '/', { body: {} });

    // Assert
    expect(result.nextErr).toBeTruthy();
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/name is required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('calls next with 400 when name is blank whitespace', async () => {
    // Arrange
    const mockQuery = vi.fn();
    const router = await loadProjectsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'POST', '/', { body: { name: '   ' } });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/name is required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects/:id — not found', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('calls next with 404 when project does not exist', async () => {
    // Arrange
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    const router = await loadProjectsRouter(() => ({ query: mockQuery }));

    // Act
    const result = await routerRequest(router, 'GET', '/999', { params: { id: '999' } });

    // Assert
    const err = result.nextErr as { status: number; message: string };
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/project not found/i);
  });
});
