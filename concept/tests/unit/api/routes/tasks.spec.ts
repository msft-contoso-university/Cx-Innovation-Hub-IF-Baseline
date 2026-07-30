import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// ---------------------------------------------------------------------------
// Mock database pool
// ---------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

// ---------------------------------------------------------------------------
// Load the tasks router with the database dependency mocked
// ---------------------------------------------------------------------------
const routerPath = require.resolve('../../../../apps/api/src/routes/tasks.js');
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

delete require.cache[routerPath];
Module._load = (request: string, parent: unknown, isMain: boolean) => {
  if (request === '../services/database') {
    return { getPool: () => mockPool };
  }
  return originalLoad(request, parent, isMain);
};
const router = require(routerPath);
Module._load = originalLoad;

// ---------------------------------------------------------------------------
// Build Express app
// ---------------------------------------------------------------------------
const requireFromApi = createRequire(routerPath);
const express = requireFromApi('express');
const { errorHandler } = require(errorHandlerPath);

const app = express();
app.use(express.json());
app.use('/api', router);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start / stop the test server
// ---------------------------------------------------------------------------
let baseUrl: string;
const server = createServer(app);

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  mockQuery.mockReset();
});

// ---------------------------------------------------------------------------
// Shared task fixture
// ---------------------------------------------------------------------------
const taskRow = {
  id: '10',
  project_id: '1',
  title: 'Fix bug',
  description: null,
  status: 'todo',
  position: 0,
  assigned_user_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  assigned_user_name: null,
  assigned_user_avatar_color: null,
};

// ---------------------------------------------------------------------------
// Tests: POST /api/projects/:projectId/tasks
// ---------------------------------------------------------------------------
describe('POST /api/projects/:projectId/tasks', () => {
  it('creates a task and returns 201', async () => {
    // Arrange — 3 queries: get next position, insert, fetch with user details
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: '10' }] })
      .mockResolvedValueOnce({ rows: [taskRow] });

    // Act
    const resp = await fetch(`${baseUrl}/api/projects/1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Fix bug' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(201);
    expect(body.title).toBe('Fix bug');
  });

  it('returns 400 when title is missing', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/projects/1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'no title' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toBe('Task title is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when title is whitespace only', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/projects/1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });

    // Assert
    expect(resp.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: PUT /api/tasks/:id
// ---------------------------------------------------------------------------
describe('PUT /api/tasks/:id', () => {
  it('updates the task title and returns the updated record', async () => {
    // Arrange — 2 queries: update, fetch with user details
    const updated = { ...taskRow, title: 'New title' };
    mockQuery
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [updated] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New title' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body.title).toBe('New title');
  });

  it('returns 400 when title is missing', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'no title' }),
    });

    // Assert
    expect(resp.status).toBe(400);
  });

  it('returns 400 when title is whitespace only', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '  ' }),
    });

    // Assert
    expect(resp.status).toBe(400);
  });

  it('returns 404 when the task does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/999`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ghost task' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(404);
    expect(body.error.message).toBe('Task not found');
  });
});

// ---------------------------------------------------------------------------
// Tests: PATCH /api/tasks/:id/status
// ---------------------------------------------------------------------------
describe('PATCH /api/tasks/:id/status', () => {
  it('updates task status and returns the updated record', async () => {
    // Arrange — 2 queries: update, fetch with user details
    const updated = { ...taskRow, status: 'in_progress' };
    mockQuery
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [updated] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress', position: 1 }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body.status).toBe('in_progress');
  });

  it('returns 400 for an invalid status value', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'wip', position: 0 }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toMatch(/Invalid status/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects all statuses not in the allowed set', async () => {
    for (const bad of ['pending', 'cancelled', '', 'DONE']) {
      mockQuery.mockReset();
      const resp = await fetch(`${baseUrl}/api/tasks/10/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: bad, position: 0 }),
      });
      expect(resp.status, `expected 400 for status="${bad}"`).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    }
  });

  it('returns 400 when position is missing', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });

    // Assert
    expect(resp.status).toBe(400);
  });

  it('returns 404 when the task does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/999/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done', position: 0 }),
    });

    // Assert
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tests: PATCH /api/tasks/:id/assign
// ---------------------------------------------------------------------------
describe('PATCH /api/tasks/:id/assign', () => {
  it('assigns a user and returns the updated task', async () => {
    // Arrange — 2 queries: update, fetch with user details
    const assigned = { ...taskRow, assigned_user_id: 'user-1', assigned_user_name: 'Alice' };
    mockQuery
      .mockResolvedValueOnce({ rows: [assigned] })
      .mockResolvedValueOnce({ rows: [assigned] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_user_id: 'user-1' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body.assigned_user_id).toBe('user-1');
  });

  it('unassigns a user when assigned_user_id is null', async () => {
    // Arrange
    const unassigned = { ...taskRow, assigned_user_id: null };
    mockQuery
      .mockResolvedValueOnce({ rows: [unassigned] })
      .mockResolvedValueOnce({ rows: [unassigned] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_user_id: null }),
    });

    // Assert
    expect(resp.status).toBe(200);
    // The update should have been called with null
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      [null, '10'],
    );
  });

  it('returns 404 when the task does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/999/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_user_id: 'user-1' }),
    });

    // Assert
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tests: DELETE /api/tasks/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/tasks/:id', () => {
  it('deletes the task and returns a confirmation message', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '10' }] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10`, { method: 'DELETE' });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body.message).toBe('Task deleted');
    expect(body.id).toBe('10');
  });

  it('returns 404 when the task does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/999`, { method: 'DELETE' });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(404);
    expect(body.error.message).toBe('Task not found');
  });
});
