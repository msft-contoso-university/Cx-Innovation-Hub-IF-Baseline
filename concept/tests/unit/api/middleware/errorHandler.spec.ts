import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('creates an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('attaches a 400 status for bad-request errors', () => {
    const err = createError(400, 'Project name is required');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Project name is required');
  });

  it('attaches a 403 status for forbidden errors', () => {
    const err = createError(403, 'You can only edit your own comments');
    expect(err.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  function makeRes() {
    const res: Record<string, unknown> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn();
    return res;
  }

  it('responds with the error status and message from createError', () => {
    // Arrange
    const err = createError(400, 'Bad input');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 400, message: 'Bad input' } });
  });

  it('defaults status to 500 when error has no status property', () => {
    // Arrange
    const err = new Error('Something exploded');
    const req = { method: 'GET', originalUrl: '/api/health' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 500, message: 'Something exploded' } });
  });

  it('uses "Internal Server Error" when the error has no message', () => {
    // Arrange
    const err = { status: 503 };
    const req = { method: 'GET', originalUrl: '/api/health' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith({ error: { status: 503, message: 'Internal Server Error' } });
  });

  it('uses 500 and "Internal Server Error" when error is empty object', () => {
    // Arrange
    const err = {};
    const req = { method: 'DELETE', originalUrl: '/api/tasks/1' };
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 500, message: 'Internal Server Error' } });
  });
});
