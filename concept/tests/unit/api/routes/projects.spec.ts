import { describe, expect, it } from 'vitest';

import { createNext, createRequest, createResponse, loadRoutes } from './routeTestHarness';

const PROJECT_ROW = { id: 'project-1', name: 'Taskify', description: null };

describe('projects routes', () => {
  describe('POST /', () => {
    it('creates a project with a trimmed name and 201 status', async () => {
      // Arrange
      const routes = loadRoutes('projects.js', () => ({ rows: [PROJECT_ROW] }));
      const req = createRequest({ body: { name: '  Taskify  ', description: 'Kanban demo' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(PROJECT_ROW);
      expect(routes.queries[0].params).toEqual(['Taskify', 'Kanban demo']);
    });

    it('stores a null description when none is supplied', async () => {
      // Arrange
      const routes = loadRoutes('projects.js', () => ({ rows: [PROJECT_ROW] }));
      const req = createRequest({ body: { name: 'Taskify' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/')(req, res, next);

      // Assert
      expect(routes.queries[0].params).toEqual(['Taskify', null]);
    });

    it.each([
      ['missing name', {}],
      ['empty name', { name: '' }],
      ['whitespace-only name', { name: '   ' }],
    ])('rejects %s with 400 and performs no insert', async (_label, body) => {
      // Arrange
      const routes = loadRoutes('projects.js', () => ({ rows: [PROJECT_ROW] }));
      const req = createRequest({ body });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('post', '/')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 400, message: 'Project name is required' });
      expect(routes.queries).toHaveLength(0);
    });
  });

  describe('GET /:id', () => {
    it('returns the project when it exists', async () => {
      // Arrange
      const routes = loadRoutes('projects.js', () => ({ rows: [PROJECT_ROW] }));
      const req = createRequest({ params: { id: 'project-1' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('get', '/:id')(req, res, next);

      // Assert
      expect(next.calls).toHaveLength(0);
      expect(res.body).toEqual(PROJECT_ROW);
      expect(routes.queries[0].params).toEqual(['project-1']);
    });

    it('returns 404 for an unknown project id', async () => {
      // Arrange
      const routes = loadRoutes('projects.js', () => ({ rows: [] }));
      const req = createRequest({ params: { id: 'missing' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('get', '/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ status: 404, message: 'Project not found' });
      expect(res.body).toBeUndefined();
    });

    it('forwards database errors to the error middleware', async () => {
      // Arrange
      const routes = loadRoutes('projects.js', () => {
        throw new Error('query timeout');
      });
      const req = createRequest({ params: { id: 'project-1' } });
      const res = createResponse();
      const next = createNext();

      // Act
      await routes.handler('get', '/:id')(req, res, next);

      // Assert
      expect(next.error).toMatchObject({ message: 'query timeout' });
    });
  });
});
