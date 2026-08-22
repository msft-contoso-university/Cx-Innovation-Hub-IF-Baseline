import { describe, expect, it } from 'vitest';

import {
  createNext,
  createRequest,
  createResponse,
  loadRoutes,
  type QueryCall,
} from './routeTestHarness';

const TASK_ROW = { id: 'task-1', title: 'Existing', status: 'todo', position: 0 };
const JOINED_TASK_ROW = { ...TASK_ROW, assigned_user_name: 'Ada', assigned_user_avatar_color: '#fff' };

/** Default double: position lookup returns 0, writes/reads return the task row. */
function defaultQuery(call: QueryCall) {
  if (call.sql.includes('next_pos')) {
    return { rows: [{ next_pos: 0 }] };
  }
  if (call.sql.includes('LEFT JOIN users')) {
    return { rows: [JOINED_TASK_ROW] };
  }
  return { rows: [TASK_ROW] };
}

describe('tasks routes', () => {
  describe('POST /projects/:projectId/tasks', () => {
    it('creates a task at the next free todo position and returns 201', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', (call) =>
        call.sql.includes('next_pos') ? { rows: [{ next_pos: 7 }] } : defaultQuery(call)
      );
      const req = createRequest({
        params: { projectId: 'project-1' },
        body: { title: '  Write tests  ', description: undefined },
      });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/projects/:projectId/tasks')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(JOINED_TASK_ROW);
      const insert = routes.queries.find((q) => q.sql.includes('INSERT INTO tasks'));
      expect(insert?.params).toEqual(['project-1', 'Write tests', null, 7, null]);
    });

    it.each([
      ['missing title', {}],
      ['empty title', { title: '' }],
      ['whitespace-only title', { title: '   ' }],
    ])('rejects %s with 400 and performs no writes', async (_label, body) => {
      // Arrange
      const routes = loadRoutes('tasks.js', defaultQuery);
      const req = createRequest({ params: { projectId: 'project-1' }, body });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/projects/:projectId/tasks')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 400, message: 'Task title is required' });
      expect(routes.queries).toHaveLength(0);
    });

    it('forwards database failures to the error middleware', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', () => {
        throw new Error('connection lost');
      });
      const req = createRequest({ params: { projectId: 'project-1' }, body: { title: 'Task' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/projects/:projectId/tasks')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ message: 'connection lost' });
      expect(res.body).toBeUndefined();
    });
  });

  describe('PUT /tasks/:id', () => {
    it('trims the title and stores a null description when omitted', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', defaultQuery);
      const req = createRequest({ params: { id: 'task-1' }, body: { title: '  Renamed  ' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('put', '/tasks/:id')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(res.body).toEqual(JOINED_TASK_ROW);
      expect(routes.queries[0].params).toEqual(['Renamed', null, 'task-1']);
    });

    it('returns 404 when no task matches the id', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', () => ({ rows: [] }));
      const req = createRequest({ params: { id: 'missing' }, body: { title: 'Renamed' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('put', '/tasks/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 404, message: 'Task not found' });
      expect(routes.queries).toHaveLength(1);
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it.each(['todo', 'in_progress', 'in_review', 'done'])('accepts the %s status', async (status) => {
      // Arrange
      const routes = loadRoutes('tasks.js', defaultQuery);
      const req = createRequest({ params: { id: 'task-1' }, body: { status, position: 0 } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('patch', '/tasks/:id/status')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(routes.queries[0].params).toEqual([status, 0, 'task-1']);
    });

    it.each([
      ['unknown status value', { status: 'archived', position: 1 }],
      ['missing status', { position: 1 }],
    ])('rejects %s with 400', async (_label, body) => {
      // Arrange
      const routes = loadRoutes('tasks.js', defaultQuery);
      const req = createRequest({ params: { id: 'task-1' }, body });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('patch', '/tasks/:id/status')(req, res, next);

      // Assert
      expect(next.error?.status).toBe(400);
      expect(next.error?.message).toContain('Invalid status');
      expect(routes.queries).toHaveLength(0);
    });

    it('accepts position 0 as a valid boundary value', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', defaultQuery);
      const req = createRequest({ params: { id: 'task-1' }, body: { status: 'done', position: 0 } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('patch', '/tasks/:id/status')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(routes.queries[0].params[1]).toBe(0);
    });

    it.each([
      ['undefined position', { status: 'done' }],
      ['null position', { status: 'done', position: null }],
    ])('rejects %s with 400', async (_label, body) => {
      // Arrange
      const routes = loadRoutes('tasks.js', defaultQuery);
      const req = createRequest({ params: { id: 'task-1' }, body });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('patch', '/tasks/:id/status')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 400, message: 'Position is required' });
      expect(routes.queries).toHaveLength(0);
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('assigns a user to the task', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', defaultQuery);
      const req = createRequest({ params: { id: 'task-1' }, body: { assigned_user_id: 'user-9' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('patch', '/tasks/:id/assign')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(routes.queries[0].params).toEqual(['user-9', 'task-1']);
      expect(res.body).toEqual(JOINED_TASK_ROW);
    });

    it('unassigns the task when assigned_user_id is null', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', defaultQuery);
      const req = createRequest({ params: { id: 'task-1' }, body: { assigned_user_id: null } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('patch', '/tasks/:id/assign')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(routes.queries[0].params).toEqual([null, 'task-1']);
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', () => ({ rows: [] }));
      const req = createRequest({ params: { id: 'missing' }, body: { assigned_user_id: 'user-9' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('patch', '/tasks/:id/assign')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 404, message: 'Task not found' });
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes the task and echoes the deleted id', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', () => ({ rows: [{ id: 'task-1' }] }));
      const req = createRequest({ params: { id: 'task-1' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('delete', '/tasks/:id')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(res.body).toEqual({ message: 'Task deleted', id: 'task-1' });
      expect(routes.queries[0].params).toEqual(['task-1']);
    });

    it('returns 404 when the task is already gone', async () => {
      // Arrange
      const routes = loadRoutes('tasks.js', () => ({ rows: [] }));
      const req = createRequest({ params: { id: 'missing' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('delete', '/tasks/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 404, message: 'Task not found' });
      expect(res.body).toBeUndefined();
    });
  });
});
