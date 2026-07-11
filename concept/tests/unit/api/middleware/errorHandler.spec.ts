import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('returns an Error with the given status and message', () => {
    // Arrange & Act
    const err = createError(400, 'Bad request');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('works with 404 status', () => {
    const err = createError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('works with 403 status', () => {
    const err = createError(403, 'Forbidden');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('works with 500 status', () => {
    const err = createError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Internal Server Error');
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  function makeReq(overrides: Record<string, unknown> = {}) {
    return {
      method: 'GET',
      originalUrl: '/api/test',
      ...overrides,
    };
  }

  function makeRes() {
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  }

  it('responds with the error status and message', () => {
    // Arrange
    const err = createError(400, 'Task title is required');
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 400, message: 'Task title is required' },
    });
  });

  it('defaults to status 500 when err.status is not set', () => {
    // Arrange
    const err = new Error('something broke');
    const req = makeReq({ method: 'POST', originalUrl: '/api/projects' });
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ status: 500 }),
      }),
    );
  });

  it('defaults to "Internal Server Error" when err.message is empty', () => {
    // Arrange
    const err: any = {};           // no message, no status
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('responds with 403 for authorization errors', () => {
    // Arrange
    const err = createError(403, 'You can only edit your own comments');
    const req = makeReq({ method: 'PUT', originalUrl: '/api/comments/42' });
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 403, message: 'You can only edit your own comments' },
    });
  });
});
