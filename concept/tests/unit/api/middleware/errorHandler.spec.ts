import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('creates an Error instance with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('attaches a 400 status code', () => {
    const err = createError(400, 'Bad Request');
    expect(err.status).toBe(400);
  });

  it('attaches a 403 status code', () => {
    const err = createError(403, 'Forbidden');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('attaches a 500 status code', () => {
    const err = createError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  function makeRes() {
    const mockJson = vi.fn();
    const mockStatus = vi.fn(() => ({ json: mockJson }));
    return { res: { status: mockStatus }, mockStatus, mockJson };
  }

  it('sends a JSON response with the error status and message', () => {
    // Arrange
    const err = { status: 404, message: 'Not found', stack: '' };
    const req = { method: 'GET', originalUrl: '/api/test' };
    const { res, mockStatus, mockJson } = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({ error: { status: 404, message: 'Not found' } });
  });

  it('defaults to status 500 when err.status is absent', () => {
    // Arrange
    const err = { message: 'Something exploded', stack: 'at ...' };
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const { res, mockStatus, mockJson } = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith({ error: { status: 500, message: 'Something exploded' } });
  });

  it('defaults to "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const err = { status: 500 };
    const req = { method: 'GET', originalUrl: '/api/health' };
    const { res, mockJson } = makeRes();

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(mockJson).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('does not call next', () => {
    // Arrange
    const err = { status: 400, message: 'Bad input', stack: '' };
    const req = { method: 'POST', originalUrl: '/api/tasks' };
    const { res } = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
  });
});
