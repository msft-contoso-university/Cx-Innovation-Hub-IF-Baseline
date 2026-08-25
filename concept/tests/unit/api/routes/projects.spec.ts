import { afterEach, describe, expect, it } from 'vitest';

import { loadRoute, type RouteHarness } from './routerHarness';

let harness: RouteHarness | undefined;

function createHarness(): RouteHarness {
  harness = loadRoute('projects');
  return harness;
}

afterEach(() => {
  harness?.dispose();
  harness = undefined;
});

describe('projects routes', () => {
  describe('GET /:id', () => {
    it('returns 404 when the project is missing', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [] });

      // Act
      const result = await route.invoke('get', '/:id', { params: { id: 'missing' } });

      // Assert
      expect(result.error?.status).toBe(404);
      expect(result.error?.message).toBe('Project not found');
    });

    it('returns the project when found', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ id: 'p-1', name: 'Taskify' }] });

      // Act
      const result = await route.invoke('get', '/:id', { params: { id: 'p-1' } });

      // Assert
      expect(result.error).toBeUndefined();
      expect(route.queries[0].params).toEqual(['p-1']);
      expect(result.body).toEqual({ id: 'p-1', name: 'Taskify' });
    });
  });

  describe('POST /', () => {
    it('rejects a whitespace-only name with 400', async () => {
      // Arrange
      const route = createHarness();

      // Act
      const result = await route.invoke('post', '/', { body: { name: '  ' } });

      // Assert
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toBe('Project name is required');
      expect(route.queries).toHaveLength(0);
    });

    it('creates a project with a trimmed name and null description', async () => {
      // Arrange
      const route = createHarness();
      route.queueQueryResult({ rows: [{ id: 'p-2', name: 'New project' }] });

      // Act
      const result = await route.invoke('post', '/', { body: { name: '  New project  ' } });

      // Assert
      expect(result.statusCode).toBe(201);
      expect(route.queries[0].params).toEqual(['New project', null]);
      expect(result.body).toEqual({ id: 'p-2', name: 'New project' });
    });

    it('forwards database failures to the error handler', async () => {
      // Arrange
      const route = createHarness();
      const dbError = new Error('unique violation');
      route.queueQueryError(dbError);

      // Act
      const result = await route.invoke('post', '/', { body: { name: 'Duplicate' } });

      // Assert
      expect(result.error).toBe(dbError);
      expect(result.body).toBeUndefined();
    });
  });
});
