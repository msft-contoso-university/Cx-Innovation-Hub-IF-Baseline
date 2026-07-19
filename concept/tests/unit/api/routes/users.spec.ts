/**
 * Unit tests for the users route handlers.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

const dir = dirname(fileURLToPath(import.meta.url));
const usersRouterPath = resolve(dir, '../../../../apps/api/src/routes/users.js');

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

let handlers: Record<string, Function> = {};

function createMockRouter() {
  const router: any = {};
  handlers = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    router[method] = (path: string, handler: Function) => {
      handlers[`${method.toUpperCase()} ${path}`] = handler;
      return router;
    };
  }
  return router;
}

function loadRouter() {
  delete require.cache[usersRouterPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') return { Router: createMockRouter };
    if (request === '../services/database') return { getPool: () => mockPool };
    return originalLoad(request, parent, isMain);
  };

  require(usersRouterPath);
}

beforeEach(() => {
  vi.clearAllMocks();
  loadRouter();
});

afterEach(() => {
  Module._load = originalLoad;
});

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
describe('GET /api/users', () => {
  it('responds with an array of users ordered by name', async () => {
    // Arrange
    const users = [
      { id: 'u-1', name: 'Alice', role: 'dev', avatar_color: 'blue' },
      { id: 'u-2', name: 'Bob',   role: 'pm',  avatar_color: 'red'  },
    ];
    mockQuery.mockResolvedValueOnce({ rows: users });
    const req = { body: {}, params: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['GET /']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(users);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------
describe('GET /api/users/:id', () => {
  it('calls next with 404 when the user is not found', async () => {
    // Arrange
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: 'non-existent' }, body: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['GET /:id']!(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'User not found' });
  });

  it('responds with the user when found', async () => {
    // Arrange
    const user = { id: 'u-1', name: 'Alice', role: 'dev', avatar_color: 'blue', created_at: new Date().toISOString() };
    mockQuery.mockResolvedValueOnce({ rows: [user] });
    const req = { params: { id: 'u-1' }, body: {}, headers: {} };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();

    // Act
    await handlers['GET /:id']!(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(user);
  });
});
