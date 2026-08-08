import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

function createFakeResponse() {
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

describe('errorHandler middleware', () => {
  const req = { method: 'GET', originalUrl: '/api/tasks/123' };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('responds with the error status and message when provided', () => {
    // Arrange
    const err = createError(400, 'Task title is required');
    const res = createFakeResponse();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { status: 400, message: 'Task title is required' } });
  });

  it('defaults to 500 and a generic message when the error has none', () => {
    // Arrange
    const err = new Error();
    err.message = '';
    const res = createFakeResponse();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
  });

  it('logs the stack trace for 500-level errors but not for others', () => {
    // Arrange
    const serverErr = new Error('boom');
    const clientErr = createError(403, 'Forbidden');
    const res = createFakeResponse();
    const next = vi.fn();

    // Act
    errorHandler(serverErr, req, res, next);
    const errorCallsAfterServerErr = (console.error as ReturnType<typeof vi.fn>).mock.calls.length;
    errorHandler(clientErr, req, res, next);
    const errorCallsAfterClientErr = (console.error as ReturnType<typeof vi.fn>).mock.calls.length;

    // Assert: server error logs message + stack (2 calls), client error logs only message (1 call)
    expect(errorCallsAfterServerErr).toBe(2);
    expect(errorCallsAfterClientErr).toBe(3);
  });
});
