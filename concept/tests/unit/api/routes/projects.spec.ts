import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  require,
  Module,
  originalLoad,
  makeMockRes,
  routeHandle,
  loadRouterWithMockedDb,
} from './_helpers';

const projectsPath = require.resolve('../../../../apps/api/src/routes/projects.js');
const dbPath = require.resolve('../../../../apps/api/src/services/database.js');

let mockQuery: ReturnType<typeof vi.fn>;
let router: { handle: Function };

beforeEach(async () => {
  vi.clearAllMocks();
  mockQuery = vi.fn();
  router = await loadRouterWithMockedDb(projectsPath, dbPath, mockQuery);
});

afterEach(() => {
  Module._load = originalLoad;
  delete require.cache[projectsPath];
});

// ---------------------------------------------------------------------------
// POST /api/projects – input validation
// ---------------------------------------------------------------------------
describe('POST /api/projects', () => {
  it('returns 400 when name is missing from body', async () => {
    // Arrange
    const req = { method: 'POST', url: '/', headers: {}, body: {}, params: {}, query: {} };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Project name is required' }),
    );
  });

  it('returns 400 when name is blank whitespace', async () => {
    // Arrange
    const req = { method: 'POST', url: '/', headers: {}, body: { name: '   ' }, params: {}, query: {} };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
  });

  it('returns 201 with the created project on success', async () => {
    // Arrange
    const created = { id: 'abc', name: 'My Project', description: null, created_at: new Date() };
    mockQuery.mockResolvedValue({ rows: [created] });

    const req = {
      method: 'POST',
      url: '/',
      headers: {},
      body: { name: 'My Project' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    await routeHandle(router, req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(created);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id – 404 path
// ---------------------------------------------------------------------------
describe('GET /api/projects/:id', () => {
  it('returns 404 when no project matches the id', async () => {
    // Arrange
    mockQuery.mockResolvedValue({ rows: [] });
    const req = { method: 'GET', url: '/no-such-id', headers: {}, body: {}, params: {}, query: {} };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Project not found' }),
    );
  });
});
