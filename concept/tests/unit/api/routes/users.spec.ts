import { describe, expect, it } from 'vitest';

import { loadRouter, respondInOrder } from '../support/routeHarness.js';

const USER_ROW = { id: 'u-1', name: 'Ada', role: 'engineer', avatar_color: '#fff' };

describe('GET / (users)', () => {
  it('returns the user list without exposing extra columns', async () => {
    // Arrange
    const router = loadRouter('users', respondInOrder([{ rows: [USER_ROW] }]));

    // Act
    const result = await router.invoke('get', '/');

    // Assert
    expect(result.body).toEqual([USER_ROW]);
    expect(result.queries[0].text).toContain('ORDER BY name');
  });
});

describe('GET /:id (users)', () => {
  it('returns 404 when the user does not exist', async () => {
    // Arrange
    const router = loadRouter('users', respondInOrder([{ rows: [] }]));

    // Act
    const result = await router.invoke('get', '/:id', { params: { id: 'missing' } });

    // Assert
    expect(result.error.status).toBe(404);
    expect(result.error.message).toBe('User not found');
  });

  it('passes the id as a bound parameter rather than inlining it', async () => {
    // Arrange
    const router = loadRouter('users', respondInOrder([{ rows: [USER_ROW] }]));

    // Act
    const result = await router.invoke('get', '/:id', { params: { id: "u-1' OR 1=1--" } });

    // Assert
    expect(result.queries[0].text).toContain('WHERE id = $1');
    expect(result.queries[0].params).toEqual(["u-1' OR 1=1--"]);
  });
});
