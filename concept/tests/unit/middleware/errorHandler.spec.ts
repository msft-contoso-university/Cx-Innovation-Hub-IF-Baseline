import { createRequire } from 'node:module';
import { describe, it, expect, vi, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../apps/api/src/middleware/errorHandler.js');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createError', () => {
  it('returns an Error with the given status and message', () => {
    // Arrange & Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('sets status to 400 for bad request errors', () => {
    // Arrange & Act
    const err = createError(400, 'Bad request');

    // Assert
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('sets status to 500 for internal server errors', () => {
    // Arrange & Act
    const err = createError(500, 'Internal Server Error');

    // Assert
    expect(err.status).toBe(500);
  });
});

describe('errorHandler middleware', () => {
  it('sends the error status and message as JSON', () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = createError(422, 'Unprocessable entity');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(statusFn).toHaveBeenCalledWith(422);
    expect(jsonFn).toHaveBeenCalledWith({
      error: { status: 422, message: 'Unprocessable entity' },
    });
  });

  it('defaults to 500 when error has no status', () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Something went wrong');
    const req = { method: 'GET', originalUrl: '/api/health' };
    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(statusFn).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something went wrong' },
    });
  });

  it('logs stack trace for 500 errors', () => {
    // Arrange
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Crash');
    const req = { method: 'GET', originalUrl: '/api/projects' };
    const res = { status: vi.fn().mockReturnValue({ json: vi.fn() }) };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert – once for the log line, once for the stack trace
    expect(consoleSpy).toHaveBeenCalledTimes(2);
  });

  it('does not log stack for 4xx errors', () => {
    // Arrange
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = createError(404, 'Not found');
    const req = { method: 'GET', originalUrl: '/api/users/99' };
    const res = { status: vi.fn().mockReturnValue({ json: vi.fn() }) };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert – only the single log line, no stack trace
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });
});
