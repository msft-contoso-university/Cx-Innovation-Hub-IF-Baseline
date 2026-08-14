import { afterEach, describe, expect, it } from 'vitest';

import {
  createRequest,
  createResponse,
  loadRouteModule,
  restoreModuleLoader,
} from './routeTestHarness';

const PROJECT_ID = 'f4d1b6a6-0000-4000-8000-000000000040';

function handlerFor(key: string, queryResults: unknown[] = []) {
  const { handlers, query } = loadRouteModule('projects.js', queryResults);
  const handler = handlers.get(key);
  if (!handler) {
    throw new Error(`Route not registered: ${key}`);
  }
  return { handler, query };
}

describe('projects routes', () => {
  afterEach(() => {
    restoreModuleLoader();
  });

  describe('POST /', () => {
    it('trims the name and defaults a missing description to null', async () => {
      // Arrange
      const { handler, query } = handlerFor('POST /', [
        { rows: [{ id: PROJECT_ID, name: 'Apollo', description: null }] },
      ]);
      const req = createRequest({ body: { name: '  Apollo  ' } });
      const res = createResponse();

      // Act
      await handler(req, res, (err: unknown) => {
        throw err;
      });

      // Assert
      expect(query.mock.calls[0][1]).toEqual(['Apollo', null]);
      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({ id: PROJECT_ID });
    });

    it.each([
      ['missing name', {}],
      ['whitespace-only name', { name: '   ' }],
      ['empty name', { name: '' }],
    ])('rejects %s with 400', async (_label, body) => {
      // Arrange
      const { handler, query } = handlerFor('POST /');
      const req = createRequest({ body });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(400);
      expect(error.message).toBe('Project name is required');
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('GET /:id', () => {
    it('returns 404 for an unknown project', async () => {
      // Arrange
      const { handler } = handlerFor('GET /:id', [{ rows: [] }]);
      const req = createRequest({ params: { id: 'missing' } });
      const res = createResponse();
      let error: any;

      // Act
      await handler(req, res, (err: unknown) => {
        error = err;
      });

      // Assert
      expect(error.status).toBe(404);
      expect(error.message).toBe('Project not found');
      expect(res.body).toBeUndefined();
    });

    it('returns the single project row for a known project', async () => {
      // Arrange
      const { handler, query } = handlerFor('GET /:id', [
        { rows: [{ id: PROJECT_ID, name: 'Apollo' }] },
      ]);
      const req = createRequest({ params: { id: PROJECT_ID } });
      const res = createResponse();

      // Act
      await handler(req, res, (err: unknown) => {
        throw err;
      });

      // Assert
      expect(query.mock.calls[0][1]).toEqual([PROJECT_ID]);
      expect(res.body).toEqual({ id: PROJECT_ID, name: 'Apollo' });
    });
  });
});
