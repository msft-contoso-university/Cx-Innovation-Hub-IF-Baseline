import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const errorHandlerModulePath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

describe('errorHandler middleware', () => {
  let errorHandler: (err: unknown, req: unknown, res: unknown, next: unknown) => void;
  let createError: (status: number, message: string) => Error & { status: number };
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  function createMockRes() {
    const res: Record<string, unknown> = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  }

  beforeEach(() => {
    delete require.cache[errorHandlerModulePath];
    ({ errorHandler, createError } = require(errorHandlerModulePath));
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('createError', () => {
    it('creates an Error with the given status and message', () => {
      // Arrange & Act
      const err = createError(404, 'Not Found');

      // Assert
      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(404);
      expect(err.message).toBe('Not Found');
    });
  });

  describe('errorHandler', () => {
    it('responds with the error status and message when provided', () => {
      // Arrange
      const err = createError(400, 'Bad request');
      const req = { method: 'GET', originalUrl: '/api/tasks' };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      errorHandler(err, req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: { status: 400, message: 'Bad request' },
      });
    });

    it('defaults to 500 and a generic message when the error has none', () => {
      // Arrange
      const err = new Error();
      err.message = '';
      const req = { method: 'POST', originalUrl: '/api/projects' };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      errorHandler(err, req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: { status: 500, message: 'Internal Server Error' },
      });
    });

    it('logs the stack trace only for 500-level errors', () => {
      // Arrange
      const serverErr = createError(500, 'Boom');
      serverErr.stack = 'stack-trace';
      const req = { method: 'GET', originalUrl: '/api/health' };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      errorHandler(serverErr, req, res, next);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith('stack-trace');
    });

    it('does not log the stack trace for client errors', () => {
      // Arrange
      const clientErr = createError(404, 'Not Found');
      clientErr.stack = 'stack-trace';
      const req = { method: 'GET', originalUrl: '/api/health' };
      const res = createMockRes();
      const next = vi.fn();

      // Act
      errorHandler(clientErr, req, res, next);

      // Assert
      expect(consoleErrorSpy).not.toHaveBeenCalledWith('stack-trace');
    });
  });
});
