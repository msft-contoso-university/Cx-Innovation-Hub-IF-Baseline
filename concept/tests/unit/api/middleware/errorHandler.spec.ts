import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

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

  it('responds with the error status and message when provided', () => {
    // Arrange
    const err = createError(404, 'Not found');
    const req = { method: 'GET', originalUrl: '/api/projects/missing' };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    errorHandler(err, req as any, res, next);

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { status: 404, message: 'Not found' } });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults to a 500 status and generic message when the error lacks both', () => {
    // Arrange
    const err = new Error();
    (err as any).message = '';
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const res = createMockResponse();
    const next = vi.fn();

    // Act
    errorHandler(err, req as any, res, next);

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } });
    // 500 errors additionally log the stack trace.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it('createError attaches the given status code to the error', () => {
    // Arrange & Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});
