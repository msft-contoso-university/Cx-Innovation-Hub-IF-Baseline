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
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('attaches a 400 status for bad-request errors', () => {
    // Arrange / Act
    const err = createError(400, 'Bad input');

    // Assert
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad input');
  });

  it('attaches a 403 status for forbidden errors', () => {
    const err = createError(403, 'Forbidden');
    expect(err.status).toBe(403);
  });

  it('attaches a 500 status for internal server errors', () => {
    const err = createError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Internal Server Error');
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  function buildRes() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    return { res: { status, json }, json, status };
  }

  it('responds with the error status code and message from the error object', () => {
    // Arrange
    const err = { status: 404, message: 'Not found', stack: '' };
    const req = { method: 'GET', originalUrl: '/api/test' };
    const { res, status, json } = buildRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: { status: 404, message: 'Not found' } });
  });

  it('defaults to status 500 when the error object has no status property', () => {
    // Arrange
    const err = new Error('Something went wrong');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const { res, status, json } = buildRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: { status: 500, message: 'Something went wrong' } });
  });

  it('defaults to "Internal Server Error" message when error has no message', () => {
    // Arrange
    const err = { status: 503 } as Error & { status: number };
    const req = { method: 'GET', originalUrl: '/api/health' };
    const { res, status, json } = buildRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ error: { status: 503, message: 'Internal Server Error' } });
  });

  it('does not call next', () => {
    // Arrange
    const err = { status: 400, message: 'Bad request', stack: '' };
    const req = { method: 'DELETE', originalUrl: '/api/tasks/1' };
    const { res } = buildRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
  });
});
