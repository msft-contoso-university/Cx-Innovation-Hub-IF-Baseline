/**
 * Unit tests for the /api tasks route handlers.
 *
 * Covers input-validation paths (400), not-found paths (404), and the
 * VALID_STATUSES boundary for PATCH /api/tasks/:id/status.
 */

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksRoutePath = require.resolve(
  '../../../../apps/api/src/routes/tasks.js'
);
const databasePath = require.resolve(
  '../../../../apps/api/src/services/database.js'
);
const errorHandlerPath = require.resolve(
  '../../../../apps/api/src/middleware/errorHandler.js'
);
// Resolve express from the test project's own node_modules.
const expressModulePath = require.resolve('express');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeNext() {
  return vi.fn();
}

function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) =>
      l.route?.path === path &&
      l.route?.methods?.[method.toLowerCase()]
  );
  if (!layer) throw new Error(`No ${method} ${path} route found in tasks router`);
  return layer.route.stack[0].handle as (
    req: any,
    res: any,
    next: any
  ) => Promise<void>;
}

let mockQuery: ReturnType<typeof vi.fn>;

async function loadRouter() {
  delete require.cache[tasksRoutePath];
  delete require.cache[databasePath];

  mockQuery = vi.fn();

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return originalLoad(expressModulePath, parent, isMain);
    }
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === databasePath) {
        return { getPool: () => ({ query: mockQuery }) };
      }
      if (resolved === errorHandlerPath) {
        return originalLoad(errorHandlerPath, parent, isMain);
      }
    } catch {}
    return originalLoad(request, parent, isMain);
  };

  return require(tasksRoutePath);
}

afterEach(() => {
  Module._load = originalLoad;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/tasks
// ---------------------------------------------------------------------------
describe('POST /projects/:projectId/tasks (create task)', () => {
  it('calls next with 400 when title is missing', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks');
    const req: any = { params: { projectId: 'p1' }, body: {} };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title is required/i);
  });

  it('calls next with 400 when title is only whitespace', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks');
    const req: any = { params: { projectId: 'p1' }, body: { title: '   ' } };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  it('creates the task and responds 201 on success', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'post', '/projects/:projectId/tasks');
    const newTask = { id: 't1', title: 'Fix bug', status: 'todo', position: 0 };
    // First query: get next position; second: insert; third: fetch with user
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
      .mockResolvedValueOnce({ rows: [newTask] });

    const req: any = {
      params: { projectId: 'p1' },
      body: { title: 'Fix bug' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newTask);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/tasks/:id
// ---------------------------------------------------------------------------
describe('PUT /tasks/:id (update task)', () => {
  it('calls next with 400 when title is missing', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'put', '/tasks/:id');
    const req: any = { params: { id: 't1' }, body: {} };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/title is required/i);
  });

  it('calls next with 404 when task is not found', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'put', '/tasks/:id');
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req: any = { params: { id: 'missing' }, body: { title: 'New title' } };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('updates the task and returns it', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'put', '/tasks/:id');
    const updated = { id: 't1', title: 'Updated title' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
      .mockResolvedValueOnce({ rows: [updated] });

    const req: any = { params: { id: 't1' }, body: { title: 'Updated title' } };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(updated);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id/status
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/status (change task status)', () => {
  it('calls next with 400 for an invalid status value', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'patch', '/tasks/:id/status');
    const req: any = {
      params: { id: 't1' },
      body: { status: 'invalid_status', position: 0 },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/invalid status/i);
  });

  it('calls next with 400 when position is missing', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'patch', '/tasks/:id/status');
    const req: any = {
      params: { id: 't1' },
      body: { status: 'done' },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/position is required/i);
  });

  it.each(['todo', 'in_progress', 'in_review', 'done'])(
    'accepts valid status "%s"',
    async (status) => {
      // Arrange
      const router = await loadRouter();
      const handler = findHandler(router, 'patch', '/tasks/:id/status');
      const taskRow = { id: 't1', status };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [taskRow] });

      const req: any = { params: { id: 't1' }, body: { status, position: 0 } };
      const res = makeRes();
      const next = makeNext();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(taskRow);
    }
  );

  it('calls next with 404 when task is not found', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'patch', '/tasks/:id/status');
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req: any = {
      params: { id: 'ghost' },
      body: { status: 'done', position: 0 },
    };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id
// ---------------------------------------------------------------------------
describe('DELETE /tasks/:id (delete task)', () => {
  it('calls next with 404 when task does not exist', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'delete', '/tasks/:id');
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req: any = { params: { id: 'ghost' } };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
  });

  it('returns a success message when the task is deleted', async () => {
    // Arrange
    const router = await loadRouter();
    const handler = findHandler(router, 'delete', '/tasks/:id');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });

    const req: any = { params: { id: 't1' } };
    const res = makeRes();
    const next = makeNext();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' })
    );
  });
});
