import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

describe('createError', () => {
  it('returns an Error with the given message and status', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('attaches any numeric status code to the error', () => {
    // Arrange / Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('attaches status 400 for bad-request errors', () => {
    // Arrange / Act
    const err = createError(400, 'Bad request');

    // Assert
    expect(err.status).toBe(400);
  });
});

describe('errorHandler', () => {
  function makeResMock() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    return { status, json };
  }

  it('responds with the error status and message from the error object', () => {
    // Arrange
    const err = createError(422, 'Unprocessable entity');
    const req = { method: 'POST', originalUrl: '/api/projects' } as any;
    const res = makeResMock() as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.status().json).toHaveBeenCalledWith({
      error: { status: 422, message: 'Unprocessable entity' },
    });
  });

  it('defaults to status 500 when error has no status property', () => {
    // Arrange
    const err = new Error('Something went wrong');
    const req = { method: 'GET', originalUrl: '/api/health' } as any;
    const res = makeResMock() as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('defaults to "Internal Server Error" message when error has no message', () => {
    // Arrange
    const err = { status: 500 } as any;
    const req = { method: 'GET', originalUrl: '/api/health' } as any;
    const res = makeResMock() as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status().json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('responds with 404 when a not-found error is forwarded', () => {
    // Arrange
    const err = createError(404, 'Resource not found');
    const req = { method: 'GET', originalUrl: '/api/tasks/999' } as any;
    const res = makeResMock() as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.status().json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Resource not found' },
    });
  });
});
