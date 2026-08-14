import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRequest, createResponse } from '../routes/routeTestHarness';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

describe('errorHandler middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createError attaches the HTTP status to the error', () => {
    // Arrange / Act
    const error = createError(403, 'Forbidden');

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Forbidden');
  });

  it('uses the error status and message for known HTTP errors', () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = createRequest({ method: 'PUT', originalUrl: '/api/comments/1' });
    const res = createResponse();

    // Act
    errorHandler(createError(404, 'Comment not found'), req, res, () => {});

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { status: 404, message: 'Comment not found' } });
  });

  it('defaults to 500 and logs the stack for unexpected errors', () => {
    // Arrange
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = createRequest({ method: 'GET', originalUrl: '/api/projects' });
    const res = createResponse();

    // Act
    errorHandler(new Error('boom'), req, res, () => {});

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'boom' } });
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('falls back to a generic message when the error has none', () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = createRequest({ method: 'GET', originalUrl: '/api/users' });
    const res = createResponse();

    // Act
    errorHandler(new Error(''), req, res, () => {});

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
  });
});
