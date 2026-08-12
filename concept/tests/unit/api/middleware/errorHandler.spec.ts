import { describe, it, expect, vi, afterEach } from 'vitest';
import { errorHandler, createError } from '../../../../apps/api/src/middleware/errorHandler.js';

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

describe('createError', () => {
  it('creates an Error with the given status and message (happy path)', () => {
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responds with the error status and message when both are set (happy path)', () => {
    // Arrange
    const err = createError(403, 'You can only edit your own comments');
    const req = { method: 'PUT', originalUrl: '/api/comments/1' };
    const res = createMockRes();
    const next = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: { status: 403, message: 'You can only edit your own comments' },
    });
  });

  it('defaults to 500 and a generic message when status/message are missing (edge case)', () => {
    // Arrange
    const err = new Error();
    // @ts-expect-error simulate a bare error without a custom message
    err.message = '';
    const req = { method: 'GET', originalUrl: '/api/projects' };
    const res = createMockRes();
    const next = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { status: 500, message: 'Internal Server Error' },
    });
    // Stack trace should be logged for 500-level errors.
    expect(errorSpy).toHaveBeenCalledWith(err.stack);
  });

  it('does not log the stack trace for non-500 errors (failure/invalid-input case)', () => {
    // Arrange
    const err = createError(400, 'Task title is required');
    const req = { method: 'POST', originalUrl: '/api/projects/1/tasks' };
    const res = createMockRes();
    const next = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(400);
    // Only the single summary log line should be emitted, not the stack trace.
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
