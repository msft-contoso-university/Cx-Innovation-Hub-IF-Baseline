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
// Load the users router with the database dependency mocked
// ---------------------------------------------------------------------------
const routerPath = require.resolve('../../../../apps/api/src/routes/users.js');
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
app.use('/api/users', router);
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
const userRow = {
  id: 'user-1',
  name: 'Alice',
  role: 'developer',
  avatar_color: '#ff0000',
  created_at: new Date(),
};

// ---------------------------------------------------------------------------
// Tests: GET /api/users
// ---------------------------------------------------------------------------
describe('GET /api/users', () => {
  it('returns all users ordered by name', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [userRow] });

    // Act
    const resp = await fetch(`${baseUrl}/api/users`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Alice');
  });

  it('returns an empty array when no users exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/users`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body).toHaveLength(0);
  });

  it('returns 500 on database error', async () => {
    // Arrange
    mockQuery.mockRejectedValueOnce(new Error('db error'));

    // Act
    const resp = await fetch(`${baseUrl}/api/users`);

    // Assert
    expect(resp.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/users/:id
// ---------------------------------------------------------------------------
describe('GET /api/users/:id', () => {
  it('returns the user when found', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [userRow] });

    // Act
    const resp = await fetch(`${baseUrl}/api/users/user-1`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(200);
    expect(body.name).toBe('Alice');
    expect(body.role).toBe('developer');
  });

  it('returns 404 when the user does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Act
    const resp = await fetch(`${baseUrl}/api/users/nonexistent`);
    const body = await resp.json();

    // Assert
    expect(resp.status).toBe(404);
    expect(body.error.message).toBe('User not found');
  });

  it('returns 500 on database error', async () => {
    // Arrange
    mockQuery.mockRejectedValueOnce(new Error('db timeout'));

    // Act
    const resp = await fetch(`${baseUrl}/api/users/user-1`);

    // Assert
    expect(resp.status).toBe(500);
  });
});
