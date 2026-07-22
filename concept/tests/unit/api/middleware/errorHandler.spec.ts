import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('returns an Error instance with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('attaches a 400 status for validation errors', () => {
    const err = createError(400, 'Project name is required');

    expect(err.status).toBe(400);
    expect(err.message).toBe('Project name is required');
  });

  it('attaches a 403 status for authorization errors', () => {
    const err = createError(403, 'You can only edit your own comments');

    expect(err.status).toBe(403);
    expect(err.message).toBe('You can only edit your own comments');
  });

  it('attaches a 500 status for server errors', () => {
    const err = createError(500, 'Internal Server Error');

    expect(err.status).toBe(500);
    expect(err.message).toBe('Internal Server Error');
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  let res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('responds with the error status and message as JSON', () => {
    // Arrange
    const err = createError(404, 'Project not found');
    const req = { method: 'GET', originalUrl: '/api/projects/999' };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 404, message: 'Project not found' } });
  });

  it('defaults to status 500 when the error has no status property', () => {
    // Arrange
    const err = new Error('Unexpected crash');
    const req = { method: 'POST', originalUrl: '/api/projects' };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 500, message: 'Unexpected crash' } });
  });

  it('uses "Internal Server Error" when the error has no message', () => {
    // Arrange
    const err = { status: 500 } as Error & { status: number };
    const req = { method: 'GET', originalUrl: '/api/health' };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('logs the stack trace for 500 errors', () => {
    // Arrange
    const err = new Error('DB connection failed');
    err.stack = 'Error: DB connection failed\n    at pool.connect';
    const req = { method: 'GET', originalUrl: '/api/projects' };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert — two console.error calls: request line + stack
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenNthCalledWith(
      2,
      err.stack,
    );
  });

  it('does not log a stack trace for non-500 errors', () => {
    // Arrange
    const err = createError(403, 'Forbidden');
    const req = { method: 'DELETE', originalUrl: '/api/comments/1' };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert — only one console.error call (request line)
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it('includes the HTTP method and URL in the console log', () => {
    // Arrange
    const err = createError(400, 'Task title is required');
    const req = { method: 'POST', originalUrl: '/api/projects/42/tasks' };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ERROR] POST /api/projects/42/tasks - 400: Task title is required',
    );
  });
});
