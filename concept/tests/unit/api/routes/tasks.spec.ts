import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse, findRouteHandler, loadRouterWithMockedPool } from './routeTestHelpers';

const routerModulePath = '../../../../apps/api/src/routes/tasks.js';

describe('tasks routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /projects/:projectId/tasks returns tasks for the project', async () => {
    // Arrange
    const rows = [{ id: 't1', project_id: 'p1', title: 'Task 1', status: 'todo' }];
    const query = vi.fn().mockResolvedValue({ rows });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/projects/:projectId/tasks');
    const req = { params: { projectId: 'p1' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE t.project_id = $1'), ['p1']);
    expect(res.body).toEqual(rows);
  });

  it('POST /projects/:projectId/tasks rejects a missing title', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'post', '/projects/:projectId/tasks');
    const req = { params: { projectId: 'p1' }, body: { title: '   ' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toBe('Task title is required');
  });

  it('POST /projects/:projectId/tasks creates a task in the todo column at the next position', async () => {
    // Arrange
    const createdTask = { id: 't2', project_id: 'p1', title: 'New Task', status: 'todo', position: 2 };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ next_pos: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't2' }] })
      .mockResolvedValueOnce({ rows: [createdTask] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'post', '/projects/:projectId/tasks');
    const req = { params: { projectId: 'p1' }, body: { title: '  New Task  ', assigned_user_id: 'u1' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO tasks'), [
      'p1',
      'New Task',
      null,
      2,
      'u1',
    ]);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(createdTask);
  });

  it('PUT /tasks/:id returns 404 when the task does not exist', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'put', '/tasks/:id');
    const req = { params: { id: 'missing' }, body: { title: 'Updated' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toBe('Task not found');
  });

  it('PATCH /tasks/:id/status rejects an invalid status', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'patch', '/tasks/:id/status');
    const req = { params: { id: 't1' }, body: { status: 'archived', position: 1 } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toContain('Invalid status');
  });

  it('PATCH /tasks/:id/status rejects a missing position', async () => {
    // Arrange
    const query = vi.fn();
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'patch', '/tasks/:id/status');
    const req = { params: { id: 't1' }, body: { status: 'in_progress' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toBe('Position is required');
  });

  it('PATCH /tasks/:id/status updates status and position on a valid request', async () => {
    // Arrange
    const updatedTask = { id: 't1', status: 'in_progress', position: 1 };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
      .mockResolvedValueOnce({ rows: [updatedTask] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'patch', '/tasks/:id/status');
    const req = { params: { id: 't1' }, body: { status: 'in_progress', position: 1 } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('UPDATE tasks SET status'), [
      'in_progress',
      1,
      't1',
    ]);
    expect(res.body).toEqual(updatedTask);
  });

  it('PATCH /tasks/:id/assign returns 404 when the task does not exist', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'patch', '/tasks/:id/assign');
    const req = { params: { id: 'missing' }, body: { assigned_user_id: 'u1' } };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toBe('Task not found');
  });

  it('PATCH /tasks/:id/assign unassigns a user when assigned_user_id is omitted', async () => {
    // Arrange
    const assignedTask = { id: 't1', assigned_user_id: null };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 't1' }] })
      .mockResolvedValueOnce({ rows: [assignedTask] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'patch', '/tasks/:id/assign');
    const req = { params: { id: 't1' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('UPDATE tasks SET assigned_user_id'), [
      null,
      't1',
    ]);
    expect(res.body).toEqual(assignedTask);
  });

  it('DELETE /tasks/:id returns 404 when the task does not exist', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'delete', '/tasks/:id');
    const req = { params: { id: 'missing' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.message).toBe('Task not found');
  });

  it('DELETE /tasks/:id deletes the task and returns its id', async () => {
    // Arrange
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 't1' }] });
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'delete', '/tasks/:id');
    const req = { params: { id: 't1' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(query).toHaveBeenCalledWith('DELETE FROM tasks WHERE id = $1 RETURNING id', ['t1']);
    expect(res.body).toEqual({ message: 'Task deleted', id: 't1' });
  });

  it('forwards database errors to next()', async () => {
    // Arrange
    const dbError = new Error('connection lost');
    const query = vi.fn().mockRejectedValue(dbError);
    const router = loadRouterWithMockedPool(routerModulePath, { query });
    const handler = findRouteHandler(router, 'get', '/projects/:projectId/tasks');
    const req = { params: { projectId: 'p1' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    await handler(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledWith(dbError);
  });
});
