import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createError, errorHandler } from '../../../../apps/api/src/middleware/errorHandler.js';

function createMockRes() {
  const res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
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

  it('responds with the error status and message when both are provided', () => {
    // Arrange
    const err = Object.assign(new Error('Task not found'), { status: 404 });
    const req = { method: 'GET', originalUrl: '/api/tasks/123' };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Task not found' },
    });
  });

  it('defaults to a 500 status and generic message when the error has neither', () => {
    // Arrange
    const err = new Error();
    err.message = '';
    const req = { method: 'POST', originalUrl: '/api/tasks' };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(err.stack);
  });

  it('does not log the stack trace for non-500 errors', () => {
    // Arrange
    const err = Object.assign(new Error('Bad input'), { status: 400 });
    const req = { method: 'PUT', originalUrl: '/api/tasks/123' };
    const res = createMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(err.stack);
  });
});

describe('createError', () => {
  it('creates an Error instance with the given status and message', () => {
    // Arrange
    const status = 403;
    const message = 'You can only edit your own comments';

    // Act
    const err = createError(status, message);

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
  });
});
