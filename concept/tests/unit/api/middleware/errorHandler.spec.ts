import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResponse } from '../../helpers/expressRouterHarness';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

function createRequest() {
  return { method: 'GET', originalUrl: '/api/tasks/1' } as any;
}

describe('error handler middleware', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createError attaches the status code to the error', () => {
    // Arrange & Act
    const err = createError(404, 'Task not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Task not found');
  });

  it('responds with the error status and message for known errors', () => {
    // Arrange
    const res = createResponse();

    // Act
    errorHandler(createError(403, 'Forbidden'), createRequest(), res, vi.fn());

    // Assert
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: { status: 403, message: 'Forbidden' } });
  });

  it('defaults to 500 and a generic message for unclassified errors', () => {
    // Arrange
    const res = createResponse();
    const err = new Error('');

    // Act
    errorHandler(err, createRequest(), res, vi.fn());

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
  });

  it('logs the stack trace only for 500 responses', () => {
    // Arrange
    const res = createResponse();

    // Act
    errorHandler(createError(400, 'Bad input'), createRequest(), res, vi.fn());
    const callsAfterClientError = (console.error as any).mock.calls.length;
    errorHandler(new Error('boom'), createRequest(), createResponse(), vi.fn());
    const callsAfterServerError = (console.error as any).mock.calls.length;

    // Assert
    expect(callsAfterClientError).toBe(1);
    expect(callsAfterServerError).toBe(3);
  });
});
