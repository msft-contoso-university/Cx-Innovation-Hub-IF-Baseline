import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('returns an Error instance with the given message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
  });

  it('attaches the status code to the error object', () => {
    const err = createError(400, 'Bad request');
    expect(err.status).toBe(400);
  });

  it('works for 5xx status codes', () => {
    const err = createError(503, 'Service unavailable');
    expect(err.status).toBe(503);
    expect(err.message).toBe('Service unavailable');
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  it('sends the error status and message from a createError error', () => {
    // Arrange
    const err = createError(400, 'Task title is required');
    const req = { method: 'POST', originalUrl: '/api/projects/1/tasks' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 400, message: 'Task title is required' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('defaults to status 500 when error has no status property', () => {
    // Arrange
    const err = new Error('Unexpected DB failure');
    const req = { method: 'GET', originalUrl: '/api/projects' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected DB failure' },
    });
  });

  it('defaults message to "Internal Server Error" when error message is empty', () => {
    // Arrange
    const err = Object.assign(new Error(''), { status: 500 });
    const req = { method: 'DELETE', originalUrl: '/api/tasks/99' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('includes the error status from a 403 error', () => {
    // Arrange
    const err = createError(403, 'You can only edit your own comments');
    const req = { method: 'PUT', originalUrl: '/api/comments/5' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 403, message: 'You can only edit your own comments' },
    });
  });
});
