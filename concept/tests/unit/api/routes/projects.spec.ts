import { describe, expect, it } from 'vitest';

import { loadRouter, respondInOrder } from '../support/routeHarness.js';

const PROJECT_ROW = { id: 'p-1', name: 'Taskify', description: null };

describe('GET /:id (projects)', () => {
  it('returns 404 when the project does not exist', async () => {
    // Arrange
    const router = loadRouter('projects', respondInOrder([{ rows: [] }]));

    // Act
    const result = await router.invoke('get', '/:id', { params: { id: 'missing' } });

    // Assert
    expect(result.error.status).toBe(404);
    expect(result.error.message).toBe('Project not found');
  });

  it('returns the project when found', async () => {
    // Arrange
    const router = loadRouter('projects', respondInOrder([{ rows: [PROJECT_ROW] }]));

    // Act
    const result = await router.invoke('get', '/:id', { params: { id: 'p-1' } });

    // Assert
    expect(result.body).toEqual(PROJECT_ROW);
    expect(result.queries[0].params).toEqual(['p-1']);
  });
});

describe('POST / (projects)', () => {
  it.each([undefined, '', '   '])('rejects the invalid name %s', async (name) => {
    // Arrange
    const router = loadRouter('projects', respondInOrder([]));

    // Act
    const result = await router.invoke('post', '/', { body: { name } });

    // Assert
    expect(result.error.status).toBe(400);
    expect(result.error.message).toBe('Project name is required');
    expect(result.queries).toHaveLength(0);
  });

  it('trims the name and defaults the description to null', async () => {
    // Arrange
    const router = loadRouter('projects', respondInOrder([{ rows: [PROJECT_ROW] }]));

    // Act
    const result = await router.invoke('post', '/', { body: { name: '  Taskify  ' } });

    // Assert
    expect(result.status).toBe(201);
    expect(result.body).toEqual(PROJECT_ROW);
    expect(result.queries[0].params).toEqual(['Taskify', null]);
  });
});
