import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<{ method: string; originalUrl: string }> = {}) {
  return {
    method: overrides.method ?? 'GET',
    originalUrl: overrides.originalUrl ?? '/api/test',
  };
}

function makeRes() {
  const res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
    status: vi.fn(),
    json: vi.fn(),
  };
  // Allow chaining: res.status(x).json(y)
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------

describe('createError', () => {
  it('returns an Error instance', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
  });

  it('sets the message property', () => {
    // Arrange / Act
    const err = createError(400, 'Bad request');

    // Assert
    expect(err.message).toBe('Bad request');
  });

  it('sets the status property to the provided code', () => {
    // Arrange / Act
    const err = createError(403, 'Forbidden');

    // Assert
    expect(err.status).toBe(403);
  });

  it('preserves different status codes', () => {
    expect(createError(500, 'Internal').status).toBe(500);
    expect(createError(201, 'Created').status).toBe(201);
    expect(createError(0, 'Zero').status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('responds with the error status and message', () => {
    // Arrange
    const err = createError(404, 'Project not found');
    const req = makeReq({ method: 'GET', originalUrl: '/api/projects/99' });
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 404, message: 'Project not found' } });
  });

  it('defaults to status 500 when the error has no status', () => {
    // Arrange
    const err = new Error('Unexpected failure');
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected failure' },
    });
  });

  it('uses "Internal Server Error" when message is absent', () => {
    // Arrange
    const err: { status?: number; message?: string; stack?: string } = {};
    const req = makeReq();
    const res = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('always calls console.error', () => {
    // Arrange
    const err = createError(400, 'Bad request');
    const req = makeReq({ method: 'POST', originalUrl: '/api/projects' });
    const res = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(consoleSpy).toHaveBeenCalled();
    const logMessage = consoleSpy.mock.calls[0][0] as string;
    expect(logMessage).toContain('POST');
    expect(logMessage).toContain('/api/projects');
    expect(logMessage).toContain('400');
  });

  it('logs the stack trace only for 500 errors', () => {
    // Arrange
    const err500 = new Error('Server crash');
    err500.stack = 'Error: Server crash\n  at handler (index.js:10)';

    const err404 = createError(404, 'Not found');
    err404.stack = 'Error: Not found\n  at handler (index.js:20)';

    const req = makeReq();
    const res = makeRes();

    // Act — 500 error
    errorHandler(err500, req, res, vi.fn());
    const callCount500 = consoleSpy.mock.calls.length;

    // Act — 404 error
    errorHandler(err404, req, makeRes(), vi.fn());
    const callCount404 = consoleSpy.mock.calls.length - callCount500;

    // Assert: 500 triggers an extra console.error call (for the stack), 404 does not
    expect(callCount500).toBe(2); // log line + stack trace
    expect(callCount404).toBe(1); // log line only
  });

  it('does not call next()', () => {
    // Arrange
    const err = createError(400, 'Bad');
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert — error handler terminates the request; next should not be called
    expect(next).not.toHaveBeenCalled();
  });
});
