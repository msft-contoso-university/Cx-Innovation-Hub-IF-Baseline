import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

function createResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };

  return res;
}

const req = { method: 'GET', originalUrl: '/api/projects' };

describe('errorHandler middleware', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the status and message attached to the error', () => {
    // Arrange
    const res = createResponse();
    const err = createError(404, 'Project not found');

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { status: 404, message: 'Project not found' } });
  });

  it('defaults to 500 Internal Server Error for errors without a status', () => {
    // Arrange
    const res = createResponse();

    // Act
    errorHandler(new Error('boom'), req, res, () => {});

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'boom' } });
  });

  it('falls back to a generic message when the error has none', () => {
    // Arrange
    const res = createResponse();

    // Act
    errorHandler({}, req, res, () => {});

    // Assert
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
  });

  it('logs the stack trace only for 500-level failures', () => {
    // Arrange
    const res = createResponse();

    // Act
    errorHandler(createError(400, 'Bad input'), req, res, () => {});
    const clientErrorLogCount = (console.error as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;
    errorHandler(new Error('boom'), req, createResponse(), () => {});
    const serverErrorLogCount = (console.error as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;

    // Assert
    expect(clientErrorLogCount).toBe(1);
    expect(serverErrorLogCount).toBe(3);
  });
});

describe('createError', () => {
  it('produces an Error carrying the HTTP status', () => {
    // Arrange & Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});
