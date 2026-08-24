import { describe, expect, it } from 'vitest';

import { loadRouter, type QueryMock } from './routeHarness';

function queryQueue(responses: Array<{ rows: unknown[] }>): QueryMock {
  const queue = [...responses];
  return async () => queue.shift() ?? { rows: [] };
}

describe('projects routes', () => {
  describe('GET /:id', () => {
    it('returns 404 when the project does not exist', async () => {
      // Arrange
      const harness = loadRouter('projects.js', queryQueue([{ rows: [] }]));

      // Act
      const { error } = await harness.call('GET', '/:id', { params: { id: 'missing' } });

      // Assert
      expect(error?.status).toBe(404);
      expect(error?.message).toBe('Project not found');
    });

    it('returns the single project record', async () => {
      // Arrange
      const project = { id: 'p1', name: 'Taskify' };
      const harness = loadRouter('projects.js', queryQueue([{ rows: [project] }]));

      // Act
      const { res, error } = await harness.call('GET', '/:id', { params: { id: 'p1' } });

      // Assert
      expect(error).toBeUndefined();
      expect(res.body).toEqual(project);
    });
  });

  describe('POST /', () => {
    it.each([undefined, '', '   '])('rejects name %s with 400', async (name) => {
      // Arrange
      const harness = loadRouter('projects.js', queryQueue([]));

      // Act
      const { error } = await harness.call('POST', '/', { body: { name } });

      // Assert
      expect(error?.status).toBe(400);
      expect(error?.message).toBe('Project name is required');
      expect(harness.queries).toHaveLength(0);
    });

    it('creates the project with a trimmed name and null description', async () => {
      // Arrange
      const created = { id: 'p2', name: 'New Board' };
      const harness = loadRouter('projects.js', queryQueue([{ rows: [created] }]));

      // Act
      const { res, error } = await harness.call('POST', '/', {
        body: { name: '  New Board  ' },
      });

      // Assert
      expect(error).toBeUndefined();
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(created);
      expect(harness.queries[0].params).toEqual(['New Board', null]);
    });

    it('forwards database failures to the error middleware', async () => {
      // Arrange
      const failure = new Error('insert failed');
      const harness = loadRouter('projects.js', async () => {
        throw failure;
      });

      // Act
      const { error } = await harness.call('POST', '/', { body: { name: 'New Board' } });

      // Assert
      expect(error).toBe(failure);
    });
  });
});
