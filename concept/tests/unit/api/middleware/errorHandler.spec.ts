import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockRes() {
  const res: { _status: number; _body: unknown; status: (s: number) => typeof res; json: (b: unknown) => void } = {
    _status: 0,
    _body: undefined,
    status(s) {
      this._status = s;
      return this;
    },
    json(body) {
      this._body = body;
    },
  };
  return res;
}

function makeMockReq(method = 'GET', url = '/api/test') {
  return { method, originalUrl: url };
}

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------

describe('createError', () => {
  it('returns an Error instance', () => {
    // Arrange / Act
    const err = createError(400, 'Bad Request');

    // Assert
    expect(err).toBeInstanceOf(Error);
  });

  it('attaches the given status code to the error', () => {
    // Arrange / Act
    const err = createError(422, 'Unprocessable Entity');

    // Assert
    expect(err.status).toBe(422);
  });

  it('attaches the given message to the error', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err.message).toBe('Not found');
  });

  it('works for every common HTTP error status', () => {
    // Arrange
    const cases = [400, 401, 403, 404, 409, 422, 500, 503];

    for (const status of cases) {
      // Act
      const err = createError(status, `Error ${status}`);

      // Assert
      expect(err.status).toBe(status);
      expect(err.message).toBe(`Error ${status}`);
    }
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  it('responds with the error status code from err.status', () => {
    // Arrange
    const err = createError(404, 'Not found');
    const req = makeMockReq();
    const res = makeMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res._status).toBe(404);
  });

  it('responds with a JSON body containing status and message', () => {
    // Arrange
    const err = createError(400, 'Task title is required');
    const req = makeMockReq('POST', '/api/projects/1/tasks');
    const res = makeMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res._body).toEqual({
      error: {
        status: 400,
        message: 'Task title is required',
      },
    });
  });

  it('defaults to status 500 when err.status is absent', () => {
    // Arrange
    const err = new Error('Something went wrong');
    const req = makeMockReq();
    const res = makeMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res._status).toBe(500);
  });

  it('defaults to "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const err = Object.assign(new Error(), { message: '', status: 500 });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect((res._body as { error: { message: string } }).error.message).toBe(
      'Internal Server Error',
    );
  });

  it('does not call next()', () => {
    // Arrange
    const err = createError(403, 'Forbidden');
    const req = makeMockReq();
    const res = makeMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
  });

  it('handles 403 Forbidden ownership errors correctly', () => {
    // Arrange — mirrors the ownership check in comments.js
    const err = createError(403, 'You can only edit your own comments');
    const req = makeMockReq('PUT', '/api/comments/42');
    const res = makeMockRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res._status).toBe(403);
    expect(res._body).toEqual({
      error: { status: 403, message: 'You can only edit your own comments' },
    });
  });
});
