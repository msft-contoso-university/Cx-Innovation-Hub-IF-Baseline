import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('creates an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not Found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not Found');
    expect(err.status).toBe(404);
  });

  it('creates a 400 error with the correct status', () => {
    const err = createError(400, 'Bad Request');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad Request');
  });

  it('creates a 500 error and the instance is still an Error', () => {
    const err = createError(500, 'Server Error');
    expect(err.status).toBe(500);
    expect(err instanceof Error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler middleware', () => {
  function makeRes() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    return { status, json, _json: json };
  }

  function makeReq(method = 'GET', url = '/api/test') {
    return { method, originalUrl: url };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns the error status and message in JSON', () => {
    // Arrange
    const err = createError(404, 'Project not found');
    const req = makeReq();
    const res = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.status(404).json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Project not found' },
    });
  });

  it('defaults to status 500 and "Internal Server Error" when err has no status', () => {
    // Arrange
    const err = new Error();
    const req = makeReq('POST', '/api/projects');
    const res = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status(500).json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('logs the stack trace only for 500 errors', () => {
    // Arrange
    const err500 = new Error('boom');
    err500.stack = 'Error: boom\n  at test.js:1:1';
    const consoleError = vi.spyOn(console, 'error');

    // Act
    errorHandler(err500, makeReq(), makeRes(), vi.fn());

    // Assert — stack should appear in one of the console.error calls
    const stackLogged = consoleError.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('Error: boom'))
    );
    expect(stackLogged).toBe(true);
  });

  it('does NOT log the stack trace for 4xx errors', () => {
    // Arrange
    const err404 = createError(404, 'Not found');
    err404.stack = 'Error: Not found\n  at test.js:1:1';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err404, makeReq(), makeRes(), vi.fn());

    // Assert — stack should NOT appear in any console.error call
    const stackLogged = consoleError.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('Error: Not found\n  at'))
    );
    expect(stackLogged).toBe(false);
  });

  it('includes request method and URL in the error log line', () => {
    // Arrange
    const err = createError(403, 'Forbidden');
    const req = makeReq('DELETE', '/api/comments/42');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    errorHandler(err, req, makeRes(), vi.fn());

    // Assert
    const logLine = consoleError.mock.calls[0]?.[0] ?? '';
    expect(logLine).toContain('DELETE');
    expect(logLine).toContain('/api/comments/42');
    expect(logLine).toContain('403');
  });
});
