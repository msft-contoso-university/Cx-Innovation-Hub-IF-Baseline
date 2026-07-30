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
// Load the projects router with the database dependency mocked
// ---------------------------------------------------------------------------
const routerPath = require.resolve('../../../../apps/api/src/routes/projects.js');
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
// Build Express app (using the API's own express installation)
// ---------------------------------------------------------------------------
const requireFromApi = createRequire(routerPath);
const express = requireFromApi('express');
const { errorHandler } = require(errorHandlerPath);

const app = express();
app.use(express.json());
app.use('/api/projects', router);
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
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/projects', () => {
  it('returns an array of projects from the database', async () => {
    // Arrange
    const projects = [
      { id: 1, name: 'Alpha', description: null, task_count: 3, done_count: 1, created_at: new Date(), updated_at: new Date() },
    ];
    mockQuery.mockResolvedValueOnce({ rows: projects });

    // Act
    const resp = await fetch(`${baseUrl}/api/projects`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Alpha');
  });

  it('returns 500 when the database query fails', async () => {
    // Arrange
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

    // Act
    const resp = await fetch(`${baseUrl}/api/projects`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(500);
    expect(body.error.status).toBe(500);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns the project when found', async () => {
    // Arrange
    const project = { id: '42', name: 'Beta', description: 'desc', created_at: new Date(), updated_at: new Date() };
    mockQuery.mockResolvedValueOnce({ rows: [project] });

    // Act
    const resp = await fetch(`${baseUrl}/api/projects/42`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body.name).toBe('Beta');
  });

  it('returns 404 when the project does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/projects/99`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(404);
    expect(body.error.message).toBe('Project not found');
  });

  it('returns 500 on database error', async () => {
    // Arrange
    mockQuery.mockRejectedValueOnce(new Error('timeout'));

    // Act
    const resp = await fetch(`${baseUrl}/api/projects/1`);

    // Assert
    expect(resp.status).toBe(500);
  });
});

describe('POST /api/projects', () => {
  it('creates a project and returns 201 with the new record', async () => {
    // Arrange
    const created = { id: '7', name: 'Gamma', description: 'desc', created_at: new Date(), updated_at: new Date() };
    mockQuery.mockResolvedValueOnce({ rows: [created] });

    // Act
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Gamma', description: 'desc' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(201);
    expect(body.name).toBe('Gamma');
  });

  it('returns 400 when name is missing from the body', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'no name' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toBe('Project name is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when name is a whitespace-only string', async () => {
    // Act
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(400);
    expect(body.error.message).toBe('Project name is required');
  });

  it('trims the project name before inserting', async () => {
    // Arrange
    const created = { id: '8', name: 'Trimmed', description: null, created_at: new Date(), updated_at: new Date() };
    mockQuery.mockResolvedValueOnce({ rows: [created] });

    // Act
    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Trimmed  ' }),
    });

    // Assert: first query arg is the trimmed name
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['Trimmed', null],
    );
  });

  it('returns 500 on database error', async () => {
    // Arrange
    mockQuery.mockRejectedValueOnce(new Error('unique violation'));

    // Act
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Duplicate' }),
    });

    // Assert
    expect(resp.status).toBe(500);
  });
});
