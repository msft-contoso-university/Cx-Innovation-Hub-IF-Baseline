import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('returns an Error instance with the given status and message', () => {
    // Arrange / Act
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
  });

  it('attaches a 500 status for internal errors', () => {
    const err = createError(500, 'Unexpected failure');
    expect(err.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  it('responds with the error status and message from a createError error', () => {
    // Arrange
    const err = createError(404, 'Resource not found');
    const req = { method: 'GET', originalUrl: '/api/projects/999' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 404, message: 'Resource not found' } });
  });

  it('defaults to HTTP 500 when the error has no status property', () => {
    // Arrange
    const err = new Error('Something exploded');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 500, message: 'Something exploded' } });
  });

  it('uses "Internal Server Error" when the error object has no message', () => {
    // Arrange
    const err = { status: 503 } as any;
    const req = { method: 'GET', originalUrl: '/api/health' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 503, message: 'Internal Server Error' } });
  });

  it('wraps status and message in an error envelope', () => {
    // Arrange
    const err = createError(400, 'Validation failed');
    const req = { method: 'PUT', originalUrl: '/api/tasks/42' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert — verify exact shape expected by the frontend
    const [[payload]] = (res.json as ReturnType<typeof vi.fn>).mock.calls;
    expect(payload).toHaveProperty('error.status', 400);
    expect(payload).toHaveProperty('error.message', 'Validation failed');
    expect(Object.keys(payload)).toEqual(['error']);
  });
});
