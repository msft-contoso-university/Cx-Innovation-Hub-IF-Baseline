import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

describe('createError', () => {
  it('creates an error with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('creates a 400 Bad Request error', () => {
    // Arrange / Act
    const err = createError(400, 'Validation failed');

    // Assert
    expect(err.status).toBe(400);
    expect(err.message).toBe('Validation failed');
  });

  it('creates a 500 error', () => {
    // Arrange / Act
    const err = createError(500, 'Internal Server Error');

    // Assert
    expect(err.status).toBe(500);
    expect(err.message).toBe('Internal Server Error');
  });
});

describe('errorHandler', () => {
  let req: { method: string; originalUrl: string };
  let res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = { method: 'GET', originalUrl: '/api/test' };
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    res = { status, json };
    next = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('responds with the error status and message from the error object', () => {
    // Arrange
    const err = createError(403, 'Forbidden');

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.status(403).json).toHaveBeenCalledWith({
      error: { status: 403, message: 'Forbidden' },
    });
  });

  it('defaults to status 500 when the error has no status property', () => {
    // Arrange
    const err = new Error('Something broke');

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status(500).json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something broke' },
    });
  });

  it('defaults message to "Internal Server Error" when none is provided', () => {
    // Arrange
    const err = {} as Error;

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status(500).json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('logs the error to console.error', () => {
    // Arrange
    const err = createError(422, 'Unprocessable entity');

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(console.error).toHaveBeenCalled();
  });

  it('logs the stack trace for 500 errors', () => {
    // Arrange
    const err = new Error('Unexpected failure');

    // Act
    errorHandler(err, req, res, next);

    // Assert — errorHandler logs the status line plus the stack, so at least 2 calls
    const calls = (console.error as ReturnType<typeof vi.spyOn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const allArgs = calls.flat().join(' ');
    expect(allArgs).toContain('Unexpected failure');
  });
});
