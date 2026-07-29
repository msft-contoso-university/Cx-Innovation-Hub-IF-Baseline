import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const errorHandlerPath = require.resolve('../../../apps/api/src/middleware/errorHandler.js');

function loadModule() {
  delete require.cache[errorHandlerPath];
  return require(errorHandlerPath);
}

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('creates an error with the given status and message', () => {
    // Arrange
    const { createError } = loadModule();

    // Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect((err as any).status).toBe(404);
  });

  it('creates a 400 error with the supplied message', () => {
    // Arrange
    const { createError } = loadModule();

    // Act
    const err = createError(400, 'Bad request');

    // Assert
    expect((err as any).status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('creates a 500 error', () => {
    // Arrange
    const { createError } = loadModule();

    // Act
    const err = createError(500, 'Internal Server Error');

    // Assert
    expect((err as any).status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function buildReqRes(method = 'GET', url = '/api/test') {
    const res = {
      _status: 0,
      _body: null as unknown,
      status(code: number) {
        this._status = code;
        return this;
      },
      json(body: unknown) {
        this._body = body;
        return this;
      },
    };
    const req = { method, originalUrl: url };
    return { req, res };
  }

  it('responds with the error status and message from the error object', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const { req, res } = buildReqRes();
    const err = Object.assign(new Error('Not found'), { status: 404 });

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect(res._status).toBe(404);
    expect(res._body).toEqual({ error: { status: 404, message: 'Not found' } });
  });

  it('defaults to status 500 when error has no status', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const { req, res } = buildReqRes();
    const err = new Error('Something blew up');

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect(res._status).toBe(500);
    expect((res._body as any).error.status).toBe(500);
  });

  it('logs the stack for 500-level errors', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const { req, res } = buildReqRes();
    const err = new Error('Crash');

    // Act
    errorHandler(err, req, res, () => {});

    // Assert — console.error called at least twice (message + stack)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it('does not log the stack for non-500 errors', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const { req, res } = buildReqRes();
    const err = Object.assign(new Error('Bad input'), { status: 400 });

    // Act
    errorHandler(err, req, res, () => {});

    // Assert — only the single-line error message is logged
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('uses "Internal Server Error" as the default message', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const { req, res } = buildReqRes();
    const err = Object.assign(new Error(), { status: 500, message: '' });

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect((res._body as any).error.message).toBe('Internal Server Error');
  });
});
