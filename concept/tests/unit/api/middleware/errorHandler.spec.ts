import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

describe('createError', () => {
  it('creates an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(400, 'Bad Request');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad Request');
  });

  it('creates a 404 error', () => {
    // Arrange / Act
    const err = createError(404, 'Not Found');

    // Assert
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not Found');
  });

  it('creates a 403 error', () => {
    // Arrange / Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});

describe('errorHandler', () => {
  it('responds with the error status and message as JSON', () => {
    // Arrange
    const err = createError(400, 'Validation failed');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const jsonSpy = vi.fn();
    const statusSpy = vi.fn(() => ({ json: jsonSpy }));
    const res = { status: statusSpy };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { status: 400, message: 'Validation failed' },
    });
  });

  it('defaults to 500 when err.status is not set', () => {
    // Arrange
    const err = new Error('Unexpected crash');
    const req = { method: 'GET', originalUrl: '/api/tasks' };
    const jsonSpy = vi.fn();
    const statusSpy = vi.fn(() => ({ json: jsonSpy }));
    const res = { status: statusSpy };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected crash' },
    });
  });

  it('uses default message "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const err: any = { status: 503 };
    const req = { method: 'GET', originalUrl: '/api/health' };
    const jsonSpy = vi.fn();
    const statusSpy = vi.fn(() => ({ json: jsonSpy }));
    const res = { status: statusSpy };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { status: 503, message: 'Internal Server Error' },
    });
  });
});
