import { describe, expect, it, vi } from 'vitest';

const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

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

describe('errorHandler middleware', () => {
  it('returns the error status and message when both are provided', () => {
    // Arrange
    const err = createError(404, 'Task not found');
    const req = { method: 'GET', originalUrl: '/api/tasks/1' };
    const res = createMockRes();
    const next = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { status: 404, message: 'Task not found' } });
    errorSpy.mockRestore();
  });

  it('defaults to a 500 status and generic message when the error has neither', () => {
    // Arrange
    const err = new Error();
    err.message = '';
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const res = createMockRes();
    const next = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs the stack trace only for 500-level errors', () => {
    // Arrange
    const err404 = createError(400, 'Bad request');
    const req = { method: 'PUT', originalUrl: '/api/comments/1' };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err404, req, createMockRes(), vi.fn());

    // Assert
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('createError', () => {
  it('creates an Error instance with the given status and message', () => {
    // Arrange
    // Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});
