import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockResponse,
  findRoute,
  invokeHandler,
  loadRouterModule,
} from './routeTestUtils';

const ROUTE_PATH = '../../../../apps/api/src/routes/tasks.js';

describe('tasks routes', () => {
  let routes: ReturnType<typeof loadRouterModule>['routes'];
  let mockQuery: ReturnType<typeof loadRouterModule>['mockQuery'];

  beforeEach(() => {
    ({ routes, mockQuery } = loadRouterModule(ROUTE_PATH));
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /projects/:projectId/tasks', () => {
    it('returns tasks for a project', async () => {
      // Arrange
      const tasks = [{ id: '1', title: 'Task A', status: 'todo' }];
      mockQuery.mockResolvedValueOnce({ rows: tasks });
      const handler = findRoute(routes, 'get', '/projects/:projectId/tasks');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { params: { projectId: 'p1' } }, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(tasks);
    });
  });

  describe('POST /projects/:projectId/tasks', () => {
    it('rejects when title is missing', async () => {
      // Arrange
      const handler = findRoute(routes, 'post', '/projects/:projectId/tasks');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { projectId: 'p1' }, body: {} },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'Task title is required' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates a task at the next position and returns 201', async () => {
      // Arrange
      const created = { id: 't1', title: 'New Task', position: 2 };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ next_pos: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [created] });
      const handler = findRoute(routes, 'post', '/projects/:projectId/tasks');
      const res = createMockResponse();

      // Act
      await invokeHandler(
        handler,
        { params: { projectId: 'p1' }, body: { title: 'New Task' } },
        res,
      );

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });

  describe('PUT /tasks/:id', () => {
    it('rejects when title is missing', async () => {
      // Arrange
      const handler = findRoute(routes, 'put', '/tasks/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(handler, { params: { id: 't1' }, body: {} }, res);

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'Task title is required' });
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'put', '/tasks/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'missing' }, body: { title: 'Updated' } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 404, message: 'Task not found' });
    });

    it('updates the task and returns it', async () => {
      // Arrange
      const updated = { id: 't1', title: 'Updated' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [updated] });
      const handler = findRoute(routes, 'put', '/tasks/:id');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { params: { id: 't1' }, body: { title: 'Updated' } }, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(updated);
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('rejects an invalid status', async () => {
      // Arrange
      const handler = findRoute(routes, 'patch', '/tasks/:id/status');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 't1' }, body: { status: 'bogus', position: 0 } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 400 });
      expect((nextError as Error).message).toContain('Invalid status');
    });

    it('rejects when position is missing', async () => {
      // Arrange
      const handler = findRoute(routes, 'patch', '/tasks/:id/status');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 't1' }, body: { status: 'todo' } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 400, message: 'Position is required' });
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'patch', '/tasks/:id/status');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'missing' }, body: { status: 'todo', position: 0 } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 404, message: 'Task not found' });
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('assigns a user to the task', async () => {
      // Arrange
      const assigned = { id: 't1', assigned_user_id: 'u1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [assigned] });
      const handler = findRoute(routes, 'patch', '/tasks/:id/assign');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { params: { id: 't1' }, body: { assigned_user_id: 'u1' } }, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(assigned);
    });

    it('unassigns a task when assigned_user_id is null', async () => {
      // Arrange
      const unassigned = { id: 't1', assigned_user_id: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
        .mockResolvedValueOnce({ rows: [unassigned] });
      const handler = findRoute(routes, 'patch', '/tasks/:id/assign');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { params: { id: 't1' }, body: { assigned_user_id: null } }, res);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(1, expect.any(String), [null, 't1']);
      expect(res.json).toHaveBeenCalledWith(unassigned);
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'patch', '/tasks/:id/assign');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(
        handler,
        { params: { id: 'missing' }, body: { assigned_user_id: 'u1' } },
        res,
      );

      // Assert
      expect(nextError).toMatchObject({ status: 404, message: 'Task not found' });
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const handler = findRoute(routes, 'delete', '/tasks/:id');
      const res = createMockResponse();

      // Act
      const { nextError } = await invokeHandler(handler, { params: { id: 'missing' } }, res);

      // Assert
      expect(nextError).toMatchObject({ status: 404, message: 'Task not found' });
    });

    it('deletes the task and confirms', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
      const handler = findRoute(routes, 'delete', '/tasks/:id');
      const res = createMockResponse();

      // Act
      await invokeHandler(handler, { params: { id: 't1' } }, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted', id: 't1' });
    });
  });
});
