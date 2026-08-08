import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findRoute,
  loadRouteModule,
  FakeResponse,
  type FakeRouter,
} from './testUtils';

const TASKS_MODULE = '../../../../apps/api/src/routes/tasks.js';

describe('tasks routes', () => {
  let router: FakeRouter;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const loaded = await loadRouteModule(TASKS_MODULE);
    router = loaded.router;
    mockQuery = loaded.mockQuery;
  });

  describe('GET /projects/:projectId/tasks', () => {
    it('returns tasks for the project', async () => {
      // Arrange
      const tasks = [{ id: 't1', title: 'Do the thing', status: 'todo' }];
      mockQuery.mockResolvedValueOnce({ rows: tasks });
      const handler = findRoute(router, 'get', '/projects/:projectId/tasks');
      const req = { params: { projectId: 'p1' } };
      const res = new FakeResponse();
      const next = () => undefined;

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.body).toEqual(tasks);
    });
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('rejects a missing title with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/projects/:projectId/tasks');
      const req = { params: { projectId: 'p1' }, body: {} };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;
      const next = (err?: unknown) => {
        receivedErr = err as { status?: number; message?: string };
      };

      // Act
      await handler(req, res, next);

      // Assert
      expect(receivedErr?.status).toBe(400);
      expect(receivedErr?.message).toBe('Task title is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only title with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/projects/:projectId/tasks');
      const req = { params: { projectId: 'p1' }, body: { title: '   ' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number } | undefined;
      const next = (err?: unknown) => {
        receivedErr = err as { status?: number };
      };

      // Act
      await handler(req, res, next);

      // Assert
      expect(receivedErr?.status).toBe(400);
    });

    it('creates a task with the next available position', async () => {
      // Arrange
      const handler = findRoute(router, 'post', '/projects/:projectId/tasks');
      const req = { params: { projectId: 'p1' }, body: { title: 'New task' } };
      const res = new FakeResponse();
      const next = () => undefined;
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 3 }] })
        .mockResolvedValueOnce({ rows: [{ id: 't2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't2', title: 'New task', position: 3 }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery.mock.calls[1][1]).toEqual(['p1', 'New task', null, 3, null]);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 't2', title: 'New task', position: 3 });
    });
  });

  describe('PUT /tasks/:id', () => {
    it('rejects a missing title with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'put', '/tasks/:id');
      const req = { params: { id: 't1' }, body: {} };
      const res = new FakeResponse();
      let receivedErr: { status?: number } | undefined;
      const next = (err?: unknown) => {
        receivedErr = err as { status?: number };
      };

      // Act
      await handler(req, res, next);

      // Assert
      expect(receivedErr?.status).toBe(400);
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const handler = findRoute(router, 'put', '/tasks/:id');
      const req = { params: { id: 'missing' }, body: { title: 'Updated' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;
      const next = (err?: unknown) => {
        receivedErr = err as { status?: number; message?: string };
      };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(receivedErr?.status).toBe(404);
      expect(receivedErr?.message).toBe('Task not found');
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects an invalid status with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'bogus', position: 0 } };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;
      const next = (err?: unknown) => {
        receivedErr = err as { status?: number; message?: string };
      };

      // Act
      await handler(req, res, next);

      // Assert
      expect(receivedErr?.status).toBe(400);
      expect(receivedErr?.message).toMatch(/Invalid status/);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects a missing position with 400', async () => {
      // Arrange
      const handler = findRoute(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'in_progress' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number; message?: string } | undefined;
      const next = (err?: unknown) => {
        receivedErr = err as { status?: number; message?: string };
      };

      // Act
      await handler(req, res, next);

      // Assert
      expect(receivedErr?.status).toBe(400);
      expect(receivedErr?.message).toBe('Position is required');
    });

    it('accepts position 0 as valid (falsy but not missing)', async () => {
      // Arrange
      const handler = findRoute(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'done', position: 0 } };
      const res = new FakeResponse();
      const next = () => undefined;
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1', status: 'done', position: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', status: 'done', position: 0 }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.body).toEqual({ id: 't1', status: 'done', position: 0 });
    });

    it('updates status and position for a valid request', async () => {
      // Arrange
      const handler = findRoute(router, 'patch', '/tasks/:id/status');
      const req = { params: { id: 't1' }, body: { status: 'in_review', position: 2 } };
      const res = new FakeResponse();
      const next = () => undefined;
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', status: 'in_review', position: 2 }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery.mock.calls[0][1]).toEqual(['in_review', 2, 't1']);
      expect(res.body).toEqual({ id: 't1', status: 'in_review', position: 2 });
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('unassigns a task when assigned_user_id is null', async () => {
      // Arrange
      const handler = findRoute(router, 'patch', '/tasks/:id/assign');
      const req = { params: { id: 't1' }, body: { assigned_user_id: null } };
      const res = new FakeResponse();
      const next = () => undefined;
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', assigned_user_id: null }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(mockQuery.mock.calls[0][1]).toEqual([null, 't1']);
      expect(res.body).toEqual({ id: 't1', assigned_user_id: null });
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const handler = findRoute(router, 'patch', '/tasks/:id/assign');
      const req = { params: { id: 'missing' }, body: { assigned_user_id: 'u1' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number } | undefined;
      const next = (err?: unknown) => {
        receivedErr = err as { status?: number };
      };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(receivedErr?.status).toBe(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes a task and returns its id', async () => {
      // Arrange
      const handler = findRoute(router, 'delete', '/tasks/:id');
      const req = { params: { id: 't1' } };
      const res = new FakeResponse();
      const next = () => undefined;
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.body).toEqual({ message: 'Task deleted', id: 't1' });
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const handler = findRoute(router, 'delete', '/tasks/:id');
      const req = { params: { id: 'missing' } };
      const res = new FakeResponse();
      let receivedErr: { status?: number } | undefined;
      const next = (err?: unknown) => {
        receivedErr = err as { status?: number };
      };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      await handler(req, res, next);

      // Assert
      expect(receivedErr?.status).toBe(404);
    });
  });
});
