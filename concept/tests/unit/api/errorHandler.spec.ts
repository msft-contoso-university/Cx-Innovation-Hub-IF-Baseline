import { createRequire } from 'node:module';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const errorHandlerPath = require.resolve('../../../apps/api/src/middleware/errorHandler.js');

function loadModule() {
  delete require.cache[errorHandlerPath];
  return require(errorHandlerPath);
}

describe('createError', () => {
  it('creates an Error with the given status and message', () => {
    // Arrange & Act
    const { createError } = loadModule();
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect((err as any).status).toBe(404);
  });

  it('creates a 400 Bad Request error', () => {
    const { createError } = loadModule();
    const err = createError(400, 'Name is required');

    expect(err.message).toBe('Name is required');
    expect((err as any).status).toBe(400);
  });

  it('creates a 403 Forbidden error', () => {
    const { createError } = loadModule();
    const err = createError(403, 'You can only edit your own comments');

    expect((err as any).status).toBe(403);
    expect(err.message).toBe('You can only edit your own comments');
  });

  it('creates a 500 Internal Server Error', () => {
    const { createError } = loadModule();
    const err = createError(500, 'Unexpected failure');

    expect((err as any).status).toBe(500);
    expect(err.message).toBe('Unexpected failure');
  });
});

describe('errorHandler middleware', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function makeRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it('responds with the error status and message', () => {
    // Arrange
    const { errorHandler, createError } = loadModule();
    const err = createError(404, 'Project not found');
    const req: any = { method: 'GET', originalUrl: '/api/projects/99' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 404, message: 'Project not found' } });
  });

  it('defaults to 500 when error has no status', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const err = new Error('Something went very wrong');
    const req: any = { method: 'POST', originalUrl: '/api/projects' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 500, message: 'Something went very wrong' } });
  });

  it('defaults to "Internal Server Error" when error has no message', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const err: any = { status: 503 };
    const req: any = { method: 'GET', originalUrl: '/api/health' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 503, message: 'Internal Server Error' } });
  });

  it('logs a stack trace for 500 errors', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const err = new Error('DB crash');
    const req: any = { method: 'GET', originalUrl: '/api/users' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    // console.error is called at least twice: the line log + the stack
    expect(consoleSpy).toHaveBeenCalledTimes(2);
  });

  it('does not log a stack trace for non-500 errors', () => {
    // Arrange
    const { errorHandler, createError } = loadModule();
    const err = createError(400, 'Bad input');
    const req: any = { method: 'POST', originalUrl: '/api/tasks' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    // Only one console.error call for the main log line
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });
});
