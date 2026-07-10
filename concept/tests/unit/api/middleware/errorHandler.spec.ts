import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const errorHandlerModule = require('../../../../apps/api/src/middleware/errorHandler.js');

const { createError, errorHandler } = errorHandlerModule;

describe('createError', () => {
  it('creates an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(400, 'Bad input');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad input');
  });

  it('creates an Error with 404 status', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('creates an Error with 403 status', () => {
    // Arrange / Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});

describe('errorHandler middleware', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = { method: 'GET', originalUrl: '/api/test' };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  it('uses err.status and err.message when both are set', () => {
    // Arrange
    const err = createError(400, 'Validation failed');

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 400, message: 'Validation failed' },
    });
  });

  it('defaults to status 500 when err.status is not set', () => {
    // Arrange
    const err = new Error('Something exploded');

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something exploded' },
    });
  });

  it('defaults to "Internal Server Error" when err.message is not set', () => {
    // Arrange
    const err: any = {};

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('returns 403 status for a forbidden error', () => {
    // Arrange
    const err = createError(403, 'You can only edit your own comments');

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 403, message: 'You can only edit your own comments' },
    });
  });
});
