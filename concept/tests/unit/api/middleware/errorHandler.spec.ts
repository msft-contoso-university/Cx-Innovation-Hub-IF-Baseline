import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

function createMockRes() {
  const res: { statusCode?: number; body?: unknown; status: (code: number) => typeof res; json: (body: unknown) => typeof res } = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function createMockReq() {
  return { method: 'GET', originalUrl: '/api/example' };
}

describe('createError', () => {
  it('creates an Error with the given status and message', () => {
    // Arrange
    const status = 404;
    const message = 'Not found';

    // Act
    const err = createError(status, message);

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
  });
});

describe('errorHandler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('responds with the error status and message when provided', () => {
    // Arrange
    const err = createError(403, 'Forbidden');
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: { status: 403, message: 'Forbidden' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('defaults to a 500 status and generic message when the error has none', () => {
    // Arrange
    const err = new Error();
    // Force an empty message the way a bare `new Error()` object behaves.
    err.message = '';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
  });

  it('logs the stack trace only for 500-level errors', () => {
    // Arrange
    const err = createError(500, 'Boom');
    err.stack = 'stack-trace-contents';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith('stack-trace-contents');
  });
});
