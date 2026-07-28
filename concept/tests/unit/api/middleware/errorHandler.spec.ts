import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);

const { errorHandler, createError } = require(
  '../../../../apps/api/src/middleware/errorHandler.js'
);

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('returns an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('sets status to 400 when called with 400', () => {
    const err = createError(400, 'Bad request');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('sets status to 403 for forbidden errors', () => {
    const err = createError(403, 'Forbidden');
    expect(err.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------
describe('errorHandler middleware', () => {
  function makeRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  function makeReq(method = 'GET', url = '/api/test') {
    return { method, originalUrl: url } as any;
  }

  it('returns the error status and message as JSON', () => {
    // Arrange
    const err = createError(404, 'Resource not found');
    const req = makeReq('GET', '/api/projects/99');
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Resource not found' },
    });
  });

  it('defaults to status 500 when err.status is not set', () => {
    // Arrange
    const err = new Error('Unexpected failure');
    const req = makeReq();
    const res = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected failure' },
    });
  });

  it('uses "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const err: any = { status: 500 };
    const req = makeReq();
    const res = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('passes 400 errors through without treating them as 500', () => {
    // Arrange
    const err = createError(400, 'Validation failed');
    const req = makeReq('POST', '/api/projects');
    const res = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 400, message: 'Validation failed' },
    });
  });
});
