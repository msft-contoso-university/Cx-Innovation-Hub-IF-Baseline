import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, createError } from '../../../../apps/api/src/middleware/errorHandler.js';

function createMockResponse() {
  const res: any = { statusCode: 200 };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
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

  it('responds with the error status and message when both are present', () => {
    // Arrange
    const err = createError(403, 'Forbidden');
    const req = { method: 'DELETE', originalUrl: '/api/comments/1' };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    errorHandler(err, req as any, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 403, message: 'Forbidden' },
    });
  });

  it('defaults to a 500 status and generic message when the error has none (edge case)', () => {
    // Arrange
    const err = new Error();
    // Clear the auto-generated message to exercise the fallback branch.
    err.message = '';
    const req = { method: 'GET', originalUrl: '/api/projects' };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    errorHandler(err, req as any, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('logs the stack trace only for 500-level errors', () => {
    // Arrange
    const serverErr = new Error('boom');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    errorHandler(serverErr, req as any, res, next);

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(serverErr.stack);
  });

  it('does not log the stack trace for non-500 errors', () => {
    // Arrange
    const clientErr = createError(400, 'Bad Request');
    const req = { method: 'POST', originalUrl: '/api/tasks' };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    errorHandler(clientErr, req as any, res, next);

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('400'));
  });
});

describe('createError', () => {
  it('creates an Error instance carrying the given status and message', () => {
    // Arrange & Act
    const err = createError(404, 'Not Found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not Found');
    expect((err as any).status).toBe(404);
  });
});
