/**
 * Unit tests for concept/apps/api/src/routes/projects.js
 *
 * Focus: creation validation and the 404 detail path, both driven by the new
 * Locust task lifecycle scenario.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { loadRouter, nextError, type LoadedRouter } from '../helpers/routeHarness';

describe('projects routes', () => {
  let router: LoadedRouter;

  beforeEach(() => {
    router = loadRouter('projects');
  });

  it('rejects a project without a name', async () => {
    // Arrange & Act
    const { next } = await router.invoke('post', '/', { body: {} });

    // Assert
    expect(nextError(next).status).toBe(400);
    expect(nextError(next).message).toBe('Project name is required');
    expect(router.query).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only project name', async () => {
    // Arrange & Act
    const { next } = await router.invoke('post', '/', { body: { name: '  \t ' } });

    // Assert
    expect(nextError(next).status).toBe(400);
    expect(router.query).not.toHaveBeenCalled();
  });

  it('trims the name, defaults the description and returns 201', async () => {
    // Arrange
    router.query.mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Taskify' }] });

    // Act
    const { res, next } = await router.invoke('post', '/', {
      body: { name: '  Taskify  ' },
    });

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(router.query.mock.calls[0][1]).toEqual(['Taskify', null]);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 'p1', name: 'Taskify' });
  });

  it('returns 404 for an unknown project id', async () => {
    // Arrange
    router.query.mockResolvedValueOnce({ rows: [] });

    // Act
    const { next } = await router.invoke('get', '/:id', { params: { id: 'missing' } });

    // Assert
    expect(nextError(next).status).toBe(404);
    expect(nextError(next).message).toBe('Project not found');
  });
});
