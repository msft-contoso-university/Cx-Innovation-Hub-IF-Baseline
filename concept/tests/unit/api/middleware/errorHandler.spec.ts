import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ─── createError ──────────────────────────────────────────────────────────────

describe('createError', () => {
  it('returns an Error instance with status and message attached', () => {
    // Arrange / Act
    const err = createError(400, 'Bad Request');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Bad Request');
    expect(err.status).toBe(400);
  });

  it('works for 404 status', () => {
    const err = createError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('works for 403 status', () => {
    const err = createError(403, 'Forbidden');
    expect(err.status).toBe(403);
  });

  it('works for 500 status', () => {
    const err = createError(500, 'Server fault');
    expect(err.status).toBe(500);
  });
});

// ─── errorHandler middleware ───────────────────────────────────────────────────

describe('errorHandler middleware', () => {
  let req: { method: string; originalUrl: string };
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;
  let res: { status: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    req = { method: 'GET', originalUrl: '/api/test' };
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    res = { status: mockStatus };
  });

  it('returns a JSON error body with the shape { error: { status, message } }', () => {
    // Arrange
    const err = createError(400, 'Invalid input');

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith({
      error: { status: 400, message: 'Invalid input' },
    });
  });

  it('defaults to status 500 when err.status is not set', () => {
    // Arrange
    const err = new Error('Unexpected failure');

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected failure' },
    });
  });

  it('defaults to "Internal Server Error" when err.message is falsy', () => {
    // Arrange
    const err = { status: 500, message: '' };

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(mockJson).toHaveBeenCalledWith({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('uses err.status when provided on a 404 error', () => {
    // Arrange
    const err = createError(404, 'Resource not found');

    // Act
    errorHandler(err, req, res, vi.fn());

    // Assert
    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({
      error: { status: 404, message: 'Resource not found' },
    });
  });
});
