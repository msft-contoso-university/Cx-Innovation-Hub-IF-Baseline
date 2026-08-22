import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResponse,
  getHandler,
  loadRouteModule,
  type LoadedRouter,
} from '../../helpers/expressRouterHarness';

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  } as any;
}

describe('projects routes', () => {
  let query: ReturnType<typeof vi.fn>;
  let router: LoadedRouter;

  beforeEach(() => {
    query = vi.fn();
    router = loadRouteModule('projects.js', query);
  });

  describe('POST /', () => {
    it('creates a project with a trimmed name and null description', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Apollo' }] });
      const req = createRequest({ body: { name: '  Apollo  ' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'POST /')(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(query.mock.calls[0][1]).toEqual(['Apollo', null]);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 1, name: 'Apollo' });
    });

    it('rejects a whitespace-only project name', async () => {
      // Arrange
      const req = createRequest({ body: { name: '   ', description: 'x' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'POST /')(req, res, next);

      // Assert
      expect(query).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchObject({
        status: 400,
        message: 'Project name is required',
      });
    });
  });

  describe('GET /:id', () => {
    it('returns 404 for an unknown project', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [] });
      const req = createRequest({ params: { id: '404' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'GET /:id')(req, res, next);

      // Assert
      expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Project not found' });
      expect(res.body).toBeUndefined();
    });

    it('returns the project when it exists', async () => {
      // Arrange
      query.mockResolvedValueOnce({ rows: [{ id: 2, name: 'Gemini' }] });
      const req = createRequest({ params: { id: '2' } });
      const res = createResponse();
      const next = vi.fn();

      // Act
      await getHandler(router, 'GET /:id')(req, res, next);

      // Assert
      expect(next).not.toHaveBeenCalled();
      expect(res.body).toEqual({ id: 2, name: 'Gemini' });
    });
  });
});
