import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

function createMockResponse() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: undefined,
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

describe('errorHandler middleware', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('defaults to a 500 status and generic message when the error has none', () => {
    // Arrange
    const err = new Error();
    err.message = '';
    const req = { method: 'GET', originalUrl: '/api/projects' };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('500: Internal Server Error'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(err.stack);
  });

  it('uses the error status and message when provided, without logging the stack', () => {
    // Arrange
    const err = createError(404, 'Task not found');
    const req = { method: 'DELETE', originalUrl: '/api/tasks/123' };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { status: 404, message: 'Task not found' } });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('DELETE /api/tasks/123 - 404: Task not found'));
  });

  it('createError attaches the status code to the returned Error instance', () => {
    // Arrange & Act
    const err = createError(403, 'You can only edit your own comments');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toBe('You can only edit your own comments');
  });
});
