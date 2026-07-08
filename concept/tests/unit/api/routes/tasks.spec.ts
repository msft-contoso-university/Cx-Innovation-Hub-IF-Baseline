import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const tasksModulePath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const databaseModulePath = require.resolve('../../../../apps/api/src/services/database.js');

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

function findHandler(
  router: any,
  method: string,
  routePath: string,
): ((req: any, res: any, next: any) => Promise<void>) | undefined {
  const layer = router.stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method.toLowerCase()],
  );
  return layer?.route?.stack?.[0]?.handle;
}

async function loadTasksRouter() {
  delete require.cache[tasksModulePath];

  Module._load = (request: string, parent: any, isMain: boolean) => {
    let resolved: string;
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch {
      return originalLoad(request, parent, isMain);
    }
    if (resolved === databaseModulePath) {
      return { getPool: () => mockPool };
    }
    return originalLoad(request, parent, isMain);
  };

  const router = require(tasksModulePath);
  Module._load = originalLoad;
  return router;
}

describe('tasks routes', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    router = await loadTasksRouter();
  });

  afterEach(() => {
    Module._load = originalLoad;
  });

  // ---------------------------------------------------------------------------
  // POST /projects/:projectId/tasks — input validation
  // ---------------------------------------------------------------------------
  describe('POST /projects/:projectId/tasks', () => {
    it('returns 400 when title is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/projects/:projectId/tasks')!;
      const req = { params: { projectId: '1' }, body: {}, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 400 when title is blank whitespace', async () => {
      // Arrange
      const handler = findHandler(router, 'post', '/projects/:projectId/tasks')!;
      const req = { params: { projectId: '1' }, body: { title: '   ' }, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /tasks/:id — input validation and not-found
  // ---------------------------------------------------------------------------
  describe('PUT /tasks/:id', () => {
    it('returns 400 when title is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'put', '/tasks/:id')!;
      const req = { params: { id: '1' }, body: {}, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 400 when title is blank whitespace', async () => {
      // Arrange
      const handler = findHandler(router, 'put', '/tasks/:id')!;
      const req = { params: { id: '1' }, body: { title: '  ' }, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 404 when task does not exist', async () => {
      // Arrange
      const handler = findHandler(router, 'put', '/tasks/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows
      const req = { params: { id: '999' }, body: { title: 'Updated Title' }, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /tasks/:id/status — status validation and not-found
  // ---------------------------------------------------------------------------
  describe('PATCH /tasks/:id/status', () => {
    it('returns 400 when status is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
      const req = { params: { id: '1' }, body: { position: 0 }, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 400 when status value is not in the allowed list', async () => {
      // Arrange
      const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
      const req = {
        params: { id: '1' },
        body: { status: 'pending', position: 0 },
        headers: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('accepts all four valid status values', async () => {
      // Arrange
      const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];
      const handler = findHandler(router, 'patch', '/tasks/:id/status')!;

      for (const status of validStatuses) {
        vi.clearAllMocks();
        const taskRow = { id: '1', status, position: 0 };
        mockQuery
          .mockResolvedValueOnce({ rows: [taskRow] }) // UPDATE
          .mockResolvedValueOnce({ rows: [taskRow] }); // SELECT with JOIN

        const req = { params: { id: '1' }, body: { status, position: 0 }, headers: {} };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        // Act
        await handler(req, res, next);

        // Assert
        expect(next).not.toHaveBeenCalled();
      }
    });

    it('returns 400 when position is missing', async () => {
      // Arrange
      const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
      const req = {
        params: { id: '1' },
        body: { status: 'in_progress' },
        headers: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });

    it('returns 404 when task does not exist', async () => {
      // Arrange
      const handler = findHandler(router, 'patch', '/tasks/:id/status')!;
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows
      const req = {
        params: { id: '999' },
        body: { status: 'in_progress', position: 1 },
        headers: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /tasks/:id/assign — not-found
  // ---------------------------------------------------------------------------
  describe('PATCH /tasks/:id/assign', () => {
    it('returns 404 when task does not exist', async () => {
      // Arrange
      const handler = findHandler(router, 'patch', '/tasks/:id/assign')!;
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows
      const req = {
        params: { id: '999' },
        body: { assigned_user_id: 'user-abc' },
        headers: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('accepts null assigned_user_id to unassign a user', async () => {
      // Arrange
      const handler = findHandler(router, 'patch', '/tasks/:id/assign')!;
      const taskRow = { id: '1', assigned_user_id: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [taskRow] }) // UPDATE
        .mockResolvedValueOnce({ rows: [taskRow] }); // SELECT with JOIN

      const req = { params: { id: '1' }, body: { assigned_user_id: null }, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(taskRow);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /tasks/:id — not-found
  // ---------------------------------------------------------------------------
  describe('DELETE /tasks/:id', () => {
    it('returns 404 when task does not exist', async () => {
      // Arrange
      const handler = findHandler(router, 'delete', '/tasks/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE returns no rows
      const req = { params: { id: '999' }, body: {}, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });

    it('returns success message and id when task is deleted', async () => {
      // Arrange
      const handler = findHandler(router, 'delete', '/tasks/:id')!;
      mockQuery.mockResolvedValueOnce({ rows: [{ id: '42' }] });
      const req = { params: { id: '42' }, body: {}, headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Act
      await handler(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: '42' });
    });
  });
});
