import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

describe('createError', () => {
  it('creates an Error with the given status and message', () => {
    // Arrange + Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('creates a 400 error for bad request', () => {
    const err = createError(400, 'Bad request');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('creates a 403 error for forbidden access', () => {
    const err = createError(403, 'Forbidden');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('creates a 500 error with a generic message', () => {
    const err = createError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Internal Server Error');
  });
});

describe('errorHandler middleware', () => {
  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responds with the error status and message from a createError error', () => {
    // Arrange
    const err = createError(404, 'Resource not found');
    const mockReq = { method: 'GET', originalUrl: '/api/missing' };

    // Act
    errorHandler(err, mockReq, mockRes, mockNext);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Resource not found' },
    });
  });

  it('defaults to status 500 when no status is set on the error', () => {
    // Arrange
    const err = new Error('Something blew up');
    const mockReq = { method: 'POST', originalUrl: '/api/tasks' };

    // Act
    errorHandler(err, mockReq, mockRes, mockNext);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something blew up' },
    });
  });

  it('defaults to "Internal Server Error" message when error has no message', () => {
    // Arrange
    const err = Object.assign(new Error(''), { status: 500, message: '' });
    const mockReq = { method: 'GET', originalUrl: '/api/health' };

    // Act
    errorHandler(err, mockReq, mockRes, mockNext);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('responds with 403 for a forbidden error', () => {
    // Arrange
    const err = createError(403, 'You can only edit your own comments');
    const mockReq = { method: 'PUT', originalUrl: '/api/comments/42' };

    // Act
    errorHandler(err, mockReq, mockRes, mockNext);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { status: 403, message: 'You can only edit your own comments' },
    });
  });
});
