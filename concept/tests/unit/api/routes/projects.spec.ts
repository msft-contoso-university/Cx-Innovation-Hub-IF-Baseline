import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const projectsRoutePath = require.resolve('../../../../apps/api/src/routes/projects.js');

// ---------------------------------------------------------------------------
// Shared mock factories — recreated per test via beforeEach
// ---------------------------------------------------------------------------
let mockQuery: ReturnType<typeof vi.fn>;
let capturedHandlers: Record<string, (...args: unknown[]) => Promise<void>>;

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn();
  return res;
}

async function loadRoute() {
  capturedHandlers = {};
  delete require.cache[projectsRoutePath];

  const mockRouter: Record<string, unknown> = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    mockRouter[method] = vi.fn((path: string, handler: (...args: unknown[]) => Promise<void>) => {
      capturedHandlers[`${method.toUpperCase()} ${path}`] = handler;
    });
  }

  mockQuery = vi.fn();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => mockRouter };
    }
    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  require(projectsRoutePath);
}

describe('projects route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadRoute();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------
  describe('POST /', () => {
    it('calls next with 400 when name is missing', async () => {
      // Arrange
      const req = { body: {}, params: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.message).toContain('Project name is required');
    });

    it('calls next with 400 when name is whitespace only', async () => {
      // Arrange
      const req = { body: { name: '   ' }, params: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(400);
    });

    it('inserts the project and returns 201 for a valid request', async () => {
      // Arrange
      const created = { id: 'uuid-1', name: 'Alpha', description: null, created_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [created] });

      const req = { body: { name: 'Alpha' }, params: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('trims the name before inserting', async () => {
      // Arrange
      const created = { id: 'uuid-2', name: 'Beta', description: null, created_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [created] });

      const req = { body: { name: '  Beta  ' }, params: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['POST /']?.(req, res, next);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['Beta', null],
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------
  describe('GET /:id', () => {
    it('returns the project when found', async () => {
      // Arrange
      const project = { id: 'uuid-1', name: 'Alpha', description: null };
      mockQuery.mockResolvedValueOnce({ rows: [project] });

      const req = { params: { id: 'uuid-1' }, body: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['GET /:id']?.(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(project);
    });

    it('calls next with 404 when project is not found', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = { params: { id: 'missing-id' }, body: {}, headers: {} };
      const res = makeRes();
      const next = vi.fn();

      // Act
      await capturedHandlers['GET /:id']?.(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledOnce();
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.status).toBe(404);
      expect(err.message).toContain('Project not found');
    });
  });
});
