import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createError, errorHandler } from '../../../../apps/api/src/middleware/errorHandler.js';

function createMockRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function createMockReq(overrides: Partial<{ method: string; originalUrl: string }> = {}) {
  return {
    method: overrides.method ?? 'GET',
    originalUrl: overrides.originalUrl ?? '/api/example',
  };
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
    expect(err.message).toBe(message);
    expect(err.status).toBe(status);
  });
});

describe('errorHandler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('responds with the error status and message when status is provided', () => {
    // Arrange
    const err = createError(403, 'Forbidden');
    const req = createMockReq({ method: 'DELETE', originalUrl: '/api/comments/1' });
    const res = createMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: { status: 403, message: 'Forbidden' } });
  });

  it('defaults to a 500 status and generic message when the error has none', () => {
    // Arrange
    const err = new Error();
    // Explicitly ensure no message/status is set, simulating an unexpected thrown error.
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
    const serverErr = new Error('boom');
    const clientErr = createError(400, 'Bad request');
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    // Act
    errorHandler(serverErr, req, res, next);

    // Assert: one line log + stack trace for a 500-level error
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, serverErr.stack);

    // Act
    consoleErrorSpy.mockClear();
    errorHandler(clientErr, req, createMockRes(), next);

    // Assert: only the line log, no stack trace for a 4xx error
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
