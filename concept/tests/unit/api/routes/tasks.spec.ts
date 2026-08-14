import { afterEach, describe, expect, it } from 'vitest';

import {
  createRequest,
  createResponse,
  loadRouteModule,
  restoreModuleLoader,
} from './routeTestHarness';

const TASK_ROW = {
  id: 'a4d1b6a6-0000-4000-8000-000000000001',
  project_id: 'b4d1b6a6-0000-4000-8000-000000000002',
  title: 'Write tests',
  status: 'todo',
  position: 0,
};

function handlerFor(key: string, queryResults: unknown[] = []) {
  const { handlers, query } = loadRouteModule('tasks.js', queryResults);
  const handler = handlers.get(key);
  if (!handler) {
    throw new Error(`Route not registered: ${key}`);
  }
  return { handler, query };
}

describe('tasks routes', () => {
  afterEach(() => {
    restoreModuleLoader();
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('creates a task and returns 201 with the joined user details', async () => {
      // Arrange
      const { handler, query } = handlerFor('POST /projects/:projectId/tasks', [
        { rows: [{ next_pos: 3 }] },
        { rows: [{ id: TASK_ROW.id }] },
        { rows: [{ ...TASK_ROW, position: 3, assigned_user_name: 'Ada' }] },
      ]);
      const req = createRequest({
        params: { projectId: TASK_ROW.project_id },
        body: { title: '  Write tests  ', description: '  ', assigned_user_id: undefined },
      });
      const res = createResponse();
      const next = (err: unknown) => {
        throw err;
      };

      // Act
      await handler(req, res, next);

      // Assert
      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({ id: TASK_ROW.id, assigned_user_name: 'Ada' });
      expect(query.mock.calls[1][1]).toEqual([TASK_ROW.project_id, 'Write tests', '  ', 3, null]);
    });

    it('rejects a whitespace-only title with 400', async () => {
      // Arrange
      const { handler, query } = handlerFor('POST /projects/:projectId/tasks');
      const req = createRequest({ params: { projectId: 'p1' }, body: { title: '   ' } });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(400);
      expect(error.message).toBe('Task title is required');
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('PUT /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const { handler } = handlerFor('PUT /tasks/:id', [{ rows: [] }]);
      const req = createRequest({ params: { id: 'missing' }, body: { title: 'New title' } });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(404);
      expect(error.message).toBe('Task not found');
      expect(res.body).toBeUndefined();
    });

    it('forwards database failures to the error handler', async () => {
      // Arrange
      const { handler } = handlerFor('PUT /tasks/:id', [new Error('connection lost')]);
      const req = createRequest({ params: { id: TASK_ROW.id }, body: { title: 'New title' } });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('connection lost');
      expect(error.status).toBeUndefined();
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it.each([
      ['unknown status', { status: 'archived', position: 1 }, 'Invalid status. Must be one of: todo, in_progress, in_review, done'],
      ['missing status', { position: 1 }, 'Invalid status. Must be one of: todo, in_progress, in_review, done'],
      ['missing position', { status: 'done' }, 'Position is required'],
      ['null position', { status: 'done', position: null }, 'Position is required'],
    ])('rejects %s with 400', async (_label, body, message) => {
      // Arrange
      const { handler, query } = handlerFor('PATCH /tasks/:id/status');
      const req = createRequest({ params: { id: TASK_ROW.id }, body });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(400);
      expect(error.message).toBe(message);
      expect(query).not.toHaveBeenCalled();
    });

    it('accepts position zero as a valid boundary value', async () => {
      // Arrange
      const { handler, query } = handlerFor('PATCH /tasks/:id/status', [
        { rows: [{ id: TASK_ROW.id }] },
        { rows: [{ ...TASK_ROW, status: 'done', position: 0 }] },
      ]);
      const req = createRequest({
        params: { id: TASK_ROW.id },
        body: { status: 'done', position: 0 },
      });
      const res = createResponse();

      // Act
      await handler(req, res, (err: unknown) => {
        throw err;
      });

      // Assert
      expect(query.mock.calls[0][1]).toEqual(['done', 0, TASK_ROW.id]);
      expect(res.body).toMatchObject({ status: 'done', position: 0 });
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('normalizes an empty assignee to null (unassign)', async () => {
      // Arrange
      const { handler, query } = handlerFor('PATCH /tasks/:id/assign', [
        { rows: [{ id: TASK_ROW.id }] },
        { rows: [{ ...TASK_ROW, assigned_user_id: null }] },
      ]);
      const req = createRequest({ params: { id: TASK_ROW.id }, body: { assigned_user_id: '' } });
      const res = createResponse();

      // Act
      await handler(req, res, (err: unknown) => {
        throw err;
      });

      // Assert
      expect(query.mock.calls[0][1]).toEqual([null, TASK_ROW.id]);
      expect(res.body).toMatchObject({ assigned_user_id: null });
    });

    it('returns 404 when assigning to a task that does not exist', async () => {
      // Arrange
      const { handler } = handlerFor('PATCH /tasks/:id/assign', [{ rows: [] }]);
      const req = createRequest({ params: { id: 'missing' }, body: { assigned_user_id: 'u1' } });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(404);
      expect(error.message).toBe('Task not found');
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns the deleted task id', async () => {
      // Arrange
      const { handler } = handlerFor('DELETE /tasks/:id', [{ rows: [{ id: TASK_ROW.id }] }]);
      const req = createRequest({ params: { id: TASK_ROW.id } });
      const res = createResponse();

      // Act
      await handler(req, res, (err: unknown) => {
        throw err;
      });

      // Assert
      expect(res.body).toEqual({ message: 'Task deleted', id: TASK_ROW.id });
    });

    it('returns 404 when nothing was deleted', async () => {
      // Arrange
      const { handler } = handlerFor('DELETE /tasks/:id', [{ rows: [] }]);
      const req = createRequest({ params: { id: 'missing' } });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(404);
      expect(res.body).toBeUndefined();
    });
  });
});
