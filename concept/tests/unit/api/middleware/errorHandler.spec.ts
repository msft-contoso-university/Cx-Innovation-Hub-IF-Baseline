import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

function loadErrorHandlerModule() {
  delete require.cache[errorHandlerPath];
  return require(errorHandlerPath);
}

// Minimal Express-like mock helpers
function mockRes() {
  const res = {
    _status: 0,
    _body: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res;
}

function mockReq(method = 'GET', url = '/api/test') {
  return { method, originalUrl: url };
}

describe('createError', () => {
  it('creates an error with the given status and message', () => {
    // Arrange
    const { createError } = loadErrorHandlerModule();

    // Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('creates an error with status 400 for bad-request scenarios', () => {
    // Arrange
    const { createError } = loadErrorHandlerModule();

    // Act
    const err = createError(400, 'Validation failed');

    // Assert
    expect(err.status).toBe(400);
    expect(err.message).toBe('Validation failed');
  });

  it('creates an error with status 403 for authorization failures', () => {
    // Arrange
    const { createError } = loadErrorHandlerModule();

    // Act
    const err = createError(403, 'You can only edit your own comments');

    // Assert
    expect(err.status).toBe(403);
    expect(err.message).toBe('You can only edit your own comments');
  });
});

describe('errorHandler middleware', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<Console, 'error'>>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('returns JSON with status and message from the error', () => {
    // Arrange
    const { errorHandler, createError } = loadErrorHandlerModule();
    const err = createError(404, 'User not found');
    const req = mockReq();
    const res = mockRes();

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect(res._status).toBe(404);
    expect(res._body).toEqual({ error: { status: 404, message: 'User not found' } });
  });

  it('defaults status to 500 when the error has no status property', () => {
    // Arrange
    const { errorHandler } = loadErrorHandlerModule();
    const err = new Error('Unexpected failure');
    const req = mockReq('POST', '/api/projects');
    const res = mockRes();

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect(res._status).toBe(500);
    expect(res._body).toEqual({ error: { status: 500, message: 'Unexpected failure' } });
  });

  it('defaults message to "Internal Server Error" when error message is empty', () => {
    // Arrange
    const { errorHandler } = loadErrorHandlerModule();
    const err = { status: 503 } as Error;
    const req = mockReq();
    const res = mockRes();

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect(res._status).toBe(503);
    expect((res._body as { error: { message: string } }).error.message).toBe('Internal Server Error');
  });

  it('logs the request method, URL, status, and message', () => {
    // Arrange
    const { errorHandler, createError } = loadErrorHandlerModule();
    const err = createError(400, 'Task title is required');
    const req = mockReq('POST', '/api/projects/1/tasks');
    const res = mockRes();

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('POST /api/projects/1/tasks'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('400'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Task title is required'),
    );
  });

  it('logs the error stack only for 500-level errors', () => {
    // Arrange
    const { errorHandler } = loadErrorHandlerModule();
    const err = new Error('DB connection lost');
    (err as Error & { status?: number }).status = undefined; // forces 500 default
    const req = mockReq();
    const res = mockRes();

    // Act
    errorHandler(err, req, res, () => {});

    // Assert — stack trace logged for 500
    expect(consoleSpy).toHaveBeenCalledWith(err.stack);
  });

  it('does not log the stack trace for 4xx errors', () => {
    // Arrange
    const { errorHandler, createError } = loadErrorHandlerModule();
    const err = createError(403, 'Forbidden');
    const req = mockReq('DELETE', '/api/comments/1');
    const res = mockRes();

    // Act
    errorHandler(err, req, res, () => {});

    // Assert — stack trace NOT logged for 4xx
    const stackCalls = consoleSpy.mock.calls.filter(
      (args) => args[0] === err.stack,
    );
    expect(stackCalls).toHaveLength(0);
  });
});
