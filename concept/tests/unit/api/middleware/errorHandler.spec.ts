import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

function loadModule() {
  delete require.cache[errorHandlerPath];
  return require(errorHandlerPath);
}

describe('createError', () => {
  it('returns an Error with the given status and message', () => {
    // Arrange
    const { createError } = loadModule();

    // Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('sets status 400 for bad-request errors', () => {
    // Arrange
    const { createError } = loadModule();

    // Act
    const err = createError(400, 'Bad Request');

    // Assert
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad Request');
  });

  it('sets status 403 for forbidden errors', () => {
    // Arrange
    const { createError } = loadModule();

    // Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err.status).toBe(403);
  });
});

describe('errorHandler middleware', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('responds with err.status and error JSON body', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const req: any = { method: 'GET', originalUrl: '/api/test' };
    const res: any = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();
    const err: any = { status: 404, message: 'Not found' };

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 404, message: 'Not found' } });
  });

  it('defaults to status 500 when err.status is absent', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const req: any = { method: 'POST', originalUrl: '/api/projects' };
    const res: any = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();
    const err: any = new Error('Something exploded');

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something exploded' },
    });
  });

  it('uses "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const { errorHandler } = loadModule();
    const req: any = { method: 'DELETE', originalUrl: '/api/tasks/1' };
    const res: any = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();
    const err: any = {};

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });
});
