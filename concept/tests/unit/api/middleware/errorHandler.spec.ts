import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------

describe('createError', () => {
  it('returns an Error with the given message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
  });

  it('attaches the status code to the error', () => {
    // Arrange / Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err.status).toBe(403);
  });

  it('attaches a 400 status for bad-request errors', () => {
    const err = createError(400, 'Bad request');
    expect(err.status).toBe(400);
  });

  it('attaches a 500 status for server errors', () => {
    const err = createError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------

function buildResMock() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildReqMock(method = 'GET', url = '/api/test') {
  return { method, originalUrl: url };
}

describe('errorHandler middleware', () => {
  it('responds with the error status and message', () => {
    // Arrange
    const err = createError(404, 'Resource not found');
    const req = buildReqMock();
    const res = buildResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Resource not found' },
    });
  });

  it('falls back to 500 when no status is set on the error', () => {
    // Arrange
    const err = new Error('Something went wrong');
    const req = buildReqMock('POST', '/api/projects');
    const res = buildResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something went wrong' },
    });
  });

  it('uses "Internal Server Error" when message is missing', () => {
    // Arrange
    const err = {} as Error;
    const req = buildReqMock();
    const res = buildResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });
});
