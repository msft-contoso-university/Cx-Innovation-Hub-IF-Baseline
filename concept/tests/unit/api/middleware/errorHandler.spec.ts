import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('returns an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('works for a 400 validation error', () => {
    const err = createError(400, 'Name is required');

    expect(err.status).toBe(400);
    expect(err.message).toBe('Name is required');
  });

  it('works for a 403 authorization error', () => {
    const err = createError(403, 'Forbidden');

    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('works for a 500 internal error', () => {
    const err = createError(500, 'Unexpected failure');

    expect(err.status).toBe(500);
    expect(err.message).toBe('Unexpected failure');
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler middleware', () => {
  const makeRes = () => {
    const res: Record<string, unknown> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const makeReq = (method = 'GET', url = '/api/test') => ({
    method,
    originalUrl: url,
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns a JSON error response with the correct status code', () => {
    // Arrange
    const err = createError(404, 'Project not found');
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Project not found' },
    });
  });

  it('defaults to status 500 when the error has no status property', () => {
    // Arrange
    const err = new Error('Something broke');
    const req = makeReq('POST', '/api/projects');
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something broke' },
    });
  });

  it('defaults to "Internal Server Error" when the error has no message', () => {
    // Arrange
    const err = { status: 503 } as Error;
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 503, message: 'Internal Server Error' },
    });
  });

  it('logs the error to console', () => {
    // Arrange
    const err = createError(400, 'Bad request');
    const req = makeReq('DELETE', '/api/tasks/99');
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(console.error).toHaveBeenCalled();
  });

  it('also logs the stack for 500-level errors', () => {
    // Arrange
    const err = new Error('DB connection lost');
    err.stack = 'Error: DB connection lost\n  at somewhere';
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert — console.error called at least twice (once for message, once for stack)
    expect((console.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
