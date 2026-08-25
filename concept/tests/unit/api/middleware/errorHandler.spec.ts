import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

function createResponse() {
  const captured: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  };

  return { res, captured };
}

const request = { method: 'GET', originalUrl: '/api/tasks/t-1' };

describe('errorHandler middleware', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createError attaches the status code to the error', () => {
    // Arrange & Act
    const error = createError(403, 'Forbidden');

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Forbidden');
  });

  it('uses the error status and message for known errors', () => {
    // Arrange
    const { res, captured } = createResponse();

    // Act
    errorHandler(createError(404, 'Task not found'), request, res, () => {});

    // Assert
    expect(captured.statusCode).toBe(404);
    expect(captured.body).toEqual({ error: { status: 404, message: 'Task not found' } });
  });

  it('falls back to 500 and a generic message for unexpected errors', () => {
    // Arrange
    const { res, captured } = createResponse();
    const unexpected = new Error('');

    // Act
    errorHandler(unexpected, request, res, () => {});

    // Assert
    expect(captured.statusCode).toBe(500);
    expect(captured.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
  });

  it('logs the stack trace only for 500 responses', () => {
    // Arrange
    const { res } = createResponse();

    // Act
    errorHandler(createError(400, 'Bad request'), request, res, () => {});
    const clientErrorLogCount = (console.error as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    errorHandler(new Error('boom'), request, res, () => {});
    const serverErrorLogCount = (console.error as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    // Assert
    expect(clientErrorLogCount).toBe(1);
    expect(serverErrorLogCount).toBe(3);
  });
});
