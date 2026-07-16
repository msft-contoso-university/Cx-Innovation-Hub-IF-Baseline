import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------

describe('createError', () => {
  it('creates an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('creates a 400 error', () => {
    const err = createError(400, 'Bad request');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('creates a 500 error', () => {
    const err = createError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
  });

  it('creates a 403 error', () => {
    const err = createError(403, 'Forbidden');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  function createMockReqRes() {
    const req: any = { method: 'GET', originalUrl: '/api/test' };
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return { req, res };
  }

  it('sends the error status and message as JSON', () => {
    // Arrange
    const { req, res } = createMockReqRes();
    const err = createError(404, 'Not found');

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Not found' },
    });
  });

  it('defaults to status 500 when err.status is not set', () => {
    // Arrange
    const { req, res } = createMockReqRes();
    const err = new Error('Unexpected crash');

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected crash' },
    });
  });

  it('defaults message to "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const { req, res } = createMockReqRes();
    const err: any = { status: 500 }; // no message

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Internal Server Error' }),
      }),
    );
  });

  it('logs the stack trace only for 500 errors', () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { req, res } = createMockReqRes();
    const err = createError(500, 'Boom');
    err.stack = 'Error: Boom\n  at ...';

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert — stack is logged as second console.error call
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, err.stack);

    consoleErrorSpy.mockRestore();
  });

  it('does NOT log stack trace for 4xx errors', () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { req, res } = createMockReqRes();
    const err = createError(400, 'Bad input');

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert — only one console.error call (the request log), no stack
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});
