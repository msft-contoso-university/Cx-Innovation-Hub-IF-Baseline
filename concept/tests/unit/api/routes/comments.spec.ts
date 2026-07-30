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
// Load the comments router with the database dependency mocked
// ---------------------------------------------------------------------------
const routerPath = require.resolve('../../../../apps/api/src/routes/comments.js');
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
// Shared fixtures
// ---------------------------------------------------------------------------
const commentRow = {
  id: '5',
  task_id: '10',
  user_id: 'user-1',
  parent_comment_id: null,
  content: 'Looks good',
  created_at: new Date(),
  updated_at: new Date(),
  author_name: 'Alice',
  author_avatar_color: '#ff0000',
};

// ---------------------------------------------------------------------------
// Tests: GET /api/tasks/:taskId/comments
// ---------------------------------------------------------------------------
describe('GET /api/tasks/:taskId/comments', () => {
  it('returns comments for a task', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [commentRow] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/comments`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].content).toBe('Looks good');
  });

  it('returns 500 on database error', async () => {
    // Arrange
    mockQuery.mockRejectedValueOnce(new Error('db error'));

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/comments`);

    // Assert
    expect(resp.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/tasks/:taskId/comments
// ---------------------------------------------------------------------------
describe('POST /api/tasks/:taskId/comments', () => {
  it('creates a comment and returns 201', async () => {
    // Arrange — 2 queries: insert, fetch with author details
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '5' }] })
      .mockResolvedValueOnce({ rows: [commentRow] });

    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-1' },
      body: JSON.stringify({ content: 'Looks good' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(201);
    expect(body.content).toBe('Looks good');
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Oops' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toBe('X-User-Id header is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when content is missing', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-1' },
      body: JSON.stringify({}),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toBe('Comment content is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when content is whitespace only', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/tasks/10/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-1' },
      body: JSON.stringify({ content: '   ' }),
    });

    // Assert
    expect(resp.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: PUT /api/comments/:id  (edit – author-only)
// ---------------------------------------------------------------------------
describe('PUT /api/comments/:id', () => {
  it('updates the comment and returns the edited record', async () => {
    // Arrange — 3 queries: ownership check, update, fetch with author details
    const updated = { ...commentRow, content: 'Updated text' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })   // ownership
      .mockResolvedValueOnce({ rows: [updated] })                   // update
      .mockResolvedValueOnce({ rows: [updated] });                  // fetch

    // Act
    const resp = await fetch(`${baseUrl}/api/comments/5`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-1' },
      body: JSON.stringify({ content: 'Updated text' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body.content).toBe('Updated text');
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/comments/5`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'no auth' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toBe('X-User-Id header is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 404 when the comment does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/comments/999`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-1' },
      body: JSON.stringify({ content: 'ghost comment' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(404);
    expect(body.error.message).toBe('Comment not found');
  });

  it('returns 403 when the requester is not the comment author', async () => {
    // Arrange — ownership check returns a different user
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

    // Act
    const resp = await fetch(`${baseUrl}/api/comments/5`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-1' },
      body: JSON.stringify({ content: 'not my comment' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(403);
    expect(body.error.message).toBe('You can only edit your own comments');
    // No update query should have been made
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when content is missing after ownership check', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

    // Act
    const resp = await fetch(`${baseUrl}/api/comments/5`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-1' },
      body: JSON.stringify({}),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toBe('Comment content is required');
  });
});

// ---------------------------------------------------------------------------
// Tests: DELETE /api/comments/:id  (delete – author-only)
// ---------------------------------------------------------------------------
describe('DELETE /api/comments/:id', () => {
  it('deletes the comment and returns a confirmation message', async () => {
    // Arrange — 2 queries: ownership check, delete
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/comments/5`, {
      method: 'DELETE',
      headers: { 'X-User-Id': 'user-1' },
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body.message).toBe('Comment deleted');
    expect(body.id).toBe('5');
  });

  it('returns 400 when X-User-Id header is missing', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/comments/5`, { method: 'DELETE' });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toBe('X-User-Id header is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 404 when the comment does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/comments/999`, {
      method: 'DELETE',
      headers: { 'X-User-Id': 'user-1' },
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(404);
    expect(body.error.message).toBe('Comment not found');
  });

  it('returns 403 when the requester is not the comment author', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

    // Act
    const resp = await fetch(`${baseUrl}/api/comments/5`, {
      method: 'DELETE',
      headers: { 'X-User-Id': 'user-1' },
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(403);
    expect(body.error.message).toBe('You can only delete your own comments');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
