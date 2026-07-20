import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

describe('createError', () => {
  it('returns an Error instance with the given status and message', () => {
    // Arrange + Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('attaches a 400 status for bad-request errors', () => {
    const err = createError(400, 'Project name is required');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Project name is required');
  });

  it('attaches a 403 status for forbidden errors', () => {
    const err = createError(403, 'You can only edit your own comments');
    expect(err.status).toBe(403);
    expect(err.message).toBe('You can only edit your own comments');
  });

  it('attaches a 500 status for internal errors', () => {
    const err = createError(500, 'Something went wrong');
    expect(err.status).toBe(500);
  });
});

describe('errorHandler middleware', () => {
  it('responds with the error status and message from a created error', () => {
    // Arrange
    const err = createError(404, 'Project not found');
    const req = { method: 'GET', originalUrl: '/api/projects/999' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Project not found' },
    });
  });

  it('defaults to status 500 for errors without a status property', () => {
    // Arrange
    const err = new Error('Unexpected failure');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected failure' },
    });
  });

  it('uses "Internal Server Error" when the error has no message', () => {
    // Arrange
    const err = { status: 503 } as Error;
    const req = { method: 'GET', originalUrl: '/api/health' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 503, message: 'Internal Server Error' },
    });
  });

  it('uses status 500 and default message when both are missing', () => {
    // Arrange
    const err = {} as Error;
    const req = { method: 'DELETE', originalUrl: '/api/tasks/1' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });
});
