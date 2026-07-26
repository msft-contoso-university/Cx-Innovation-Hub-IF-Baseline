import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('returns an Error with .status and .message set', () => {
    const err = createError(404, 'Not found');

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('preserves the provided HTTP status code', () => {
    expect(createError(400, 'Bad request').status).toBe(400);
    expect(createError(403, 'Forbidden').status).toBe(403);
    expect(createError(500, 'Internal error').status).toBe(500);
  });

  it('preserves the provided message string', () => {
    const msg = 'X-User-Id header is required';
    expect(createError(400, msg).message).toBe(msg);
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler middleware', () => {
  function buildResMock() {
    const res: { statusCode?: number; body?: unknown; status: (code: number) => typeof res; json: (body: unknown) => typeof res } = {
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    return res;
  }

  it('responds with the error status and message from a createError error', () => {
    // Arrange
    const err = createError(422, 'Unprocessable entity');
    const req = { method: 'POST', originalUrl: '/api/tasks' };
    const res = buildResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: { status: 422, message: 'Unprocessable entity' } });
  });

  it('defaults to status 500 when err.status is absent', () => {
    // Arrange
    const err = new Error('Unexpected failure');
    const req = { method: 'GET', originalUrl: '/api/projects' };
    const res = buildResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: { status: number } }).error.status).toBe(500);
  });

  it('defaults to "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const err = Object.assign(new Error(), { status: 503, message: '' });
    const req = { method: 'GET', originalUrl: '/api/health' };
    const res = buildResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect((res.body as { error: { message: string } }).error.message).toBe('Internal Server Error');
  });

  it('returns a consistent JSON shape { error: { status, message } }', () => {
    // Arrange
    const err = createError(403, 'Forbidden');
    const req = { method: 'DELETE', originalUrl: '/api/comments/7' };
    const res = buildResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.body).toMatchObject({ error: { status: expect.any(Number), message: expect.any(String) } });
  });
});
