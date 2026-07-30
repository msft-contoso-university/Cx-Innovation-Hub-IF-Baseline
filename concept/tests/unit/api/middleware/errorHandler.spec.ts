import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

describe('createError', () => {
  it('returns an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('returns an Error with status 400 for bad-request errors', () => {
    // Arrange / Act
    const err = createError(400, 'Bad request');

    // Assert
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('returns an Error with status 403 for forbidden errors', () => {
    // Arrange / Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err.status).toBe(403);
  });
});

describe('errorHandler', () => {
  function makeRes() {
    const res: Record<string, unknown> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  }

  function makeReq(method = 'GET', url = '/api/test') {
    return { method, originalUrl: url } as unknown as Parameters<typeof errorHandler>[1];
  }

  it('responds with the error status and message for application errors', () => {
    // Arrange
    const err = createError(422, 'Unprocessable entity');
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res as unknown as Parameters<typeof errorHandler>[2], next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 422, message: 'Unprocessable entity' } });
  });

  it('defaults to status 500 when error has no status property', () => {
    // Arrange
    const err = new Error('Something exploded');
    const req = makeReq('POST', '/api/projects');
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res as unknown as Parameters<typeof errorHandler>[2], next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 500, message: 'Something exploded' } });
  });

  it('uses "Internal Server Error" as fallback message when error has no message', () => {
    // Arrange
    const err = {} as Error;
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res as unknown as Parameters<typeof errorHandler>[2], next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 500, message: 'Internal Server Error' } });
  });

  it('returns 404 status for not-found errors', () => {
    // Arrange
    const err = createError(404, 'Task not found');
    const req = makeReq('GET', '/api/tasks/999');
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res as unknown as Parameters<typeof errorHandler>[2], next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 404, message: 'Task not found' } });
  });
});
