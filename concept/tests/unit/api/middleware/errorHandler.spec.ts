import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

function createResponse() {
  const result: { status?: number; body?: any } = {};
  const res = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(payload: unknown) {
      result.body = payload;
      return res;
    },
  };
  return { res, result };
}

const request = { method: 'GET', originalUrl: '/api/tasks/42' };

describe('createError', () => {
  it('attaches the status code to the returned error', () => {
    // Arrange / Act
    const err = createError(404, 'Task not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Task not found');
  });
});

describe('errorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the status and message from the error', () => {
    // Arrange
    const { res, result } = createResponse();

    // Act
    errorHandler(createError(403, 'You can only edit your own comments'), request, res, () => {});

    // Assert
    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: { status: 403, message: 'You can only edit your own comments' },
    });
  });

  it('defaults to 500 and a generic message for unclassified errors', () => {
    // Arrange
    const { res, result } = createResponse();
    const err = new Error('');

    // Act
    errorHandler(err, request, res, () => {});

    // Assert
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
  });

  it('logs the stack trace only for 500 responses', () => {
    // Arrange
    const serverError = new Error('boom');
    const clientError = createError(400, 'Task title is required');
    const { res: res500 } = createResponse();
    const { res: res400 } = createResponse();

    // Act
    errorHandler(serverError, request, res500, () => {});
    const stackLogged = vi.mocked(console.error).mock.calls.some(
      (call) => call[0] === serverError.stack
    );
    vi.mocked(console.error).mockClear();
    errorHandler(clientError, request, res400, () => {});
    const stackLoggedForClientError = vi.mocked(console.error).mock.calls.some(
      (call) => call[0] === clientError.stack
    );

    // Assert
    expect(stackLogged).toBe(true);
    expect(stackLoggedForClientError).toBe(false);
  });

  it('does not leak the error payload into the response body beyond status and message', () => {
    // Arrange
    const { res, result } = createResponse();
    const err: any = createError(400, 'Invalid status');
    err.internalDetail = 'connection string';

    // Act
    errorHandler(err, request, res, () => {});

    // Assert
    expect(Object.keys(result.body.error)).toEqual(['status', 'message']);
  });
});
