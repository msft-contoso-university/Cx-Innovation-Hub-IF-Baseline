import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('creates an error with the given status and message', () => {
    // Arrange / Act
    const err = createError(400, 'Bad Request');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Bad Request');
    expect(err.status).toBe(400);
  });

  it('creates a 404 error with the correct status', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('creates a 500 error', () => {
    // Arrange / Act
    const err = createError(500, 'Internal Server Error');

    // Assert
    expect(err.status).toBe(500);
  });

  it('creates a 403 error for authorization failures', () => {
    // Arrange / Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler middleware', () => {
  function makeResMock() {
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  }

  function makeReqMock(method = 'GET', url = '/api/test') {
    return { method, originalUrl: url };
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns the error status and message in a JSON envelope', () => {
    // Arrange
    const err = createError(400, 'Bad Request');
    const req = makeReqMock('POST', '/api/projects');
    const res = makeResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 400, message: 'Bad Request' } });
  });

  it('defaults to 500 when the error has no status', () => {
    // Arrange
    const err = new Error('Something exploded');
    const req = makeReqMock();
    const res = makeResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something exploded' },
    });
  });

  it('defaults message to "Internal Server Error" when error has no message', () => {
    // Arrange
    const err: any = {};
    const req = makeReqMock();
    const res = makeResMock();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('logs the stack trace for 500 errors', () => {
    // Arrange
    const err = new Error('DB crash');
    const req = makeReqMock();
    const res = makeResMock();
    const next = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err, req, res, next);

    // Assert — console.error called at least twice: message line + stack
    expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not log stack for non-500 errors', () => {
    // Arrange
    const err = createError(404, 'Not found');
    const req = makeReqMock();
    const res = makeResMock();
    const next = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err, req, res, next);

    // Assert — stack should not be logged for non-500 errors
    const stackLogged = consoleSpy.mock.calls.some(
      (args: unknown[]) => args[0] === err.stack,
    );
    expect(stackLogged).toBe(false);
  });

  it('handles a 403 authorization error correctly', () => {
    // Arrange
    const err = createError(403, 'You can only edit your own comments');
    const req = makeReqMock('PUT', '/api/comments/42');
    const res = makeResMock();
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
