import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

const baseReq = { method: 'GET', originalUrl: '/api/test' };

describe('createError', () => {
  it('creates an Error instance with the given status and message', () => {
    // Arrange + Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('attaches a 400 status for validation errors', () => {
    const err = createError(400, 'Bad request');

    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('attaches a 403 status for authorization errors', () => {
    const err = createError(403, 'Forbidden');

    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('attaches a 500 status for server errors', () => {
    const err = createError(500, 'Internal Server Error');

    expect(err.status).toBe(500);
  });
});

describe('errorHandler', () => {
  it('responds with the error status and message as JSON', () => {
    // Arrange
    const err = createError(422, 'Unprocessable Entity');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // Act
    errorHandler(err, baseReq, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 422, message: 'Unprocessable Entity' },
    });
  });

  it('defaults status to 500 when err.status is absent', () => {
    // Arrange
    const err = new Error('Unexpected failure');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // Act
    errorHandler(err, baseReq, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected failure' },
    });
  });

  it('defaults message to "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const err = { status: 503 };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // Act
    errorHandler(err, baseReq, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 503, message: 'Internal Server Error' },
    });
  });

  it('returns a 404 status and message for not-found errors', () => {
    // Arrange
    const err = createError(404, 'Resource not found');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // Act
    errorHandler(err, baseReq, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Resource not found' },
    });
  });
});
