import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe('createError', () => {
  it('returns an Error with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('creates a 400 error correctly', () => {
    const err = createError(400, 'Bad request');

    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('creates a 403 error correctly', () => {
    const err = createError(403, 'Forbidden');

    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('creates a 500 error correctly', () => {
    const err = createError(500, 'Internal Server Error');

    expect(err.status).toBe(500);
    expect(err.message).toBe('Internal Server Error');
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler middleware', () => {
  it('responds with the error status and message from the error object', () => {
    // Arrange
    const err = createError(404, 'Project not found');
    const req = { method: 'GET', originalUrl: '/api/projects/99' } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Project not found' },
    });
  });

  it('defaults to 500 status when the error has no status property', () => {
    // Arrange
    const err = new Error('Unexpected failure');
    const req = { method: 'POST', originalUrl: '/api/projects' } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Unexpected failure' },
    });
  });

  it('uses "Internal Server Error" as message when error has no message', () => {
    // Arrange
    const err = {} as any;
    const req = { method: 'GET', originalUrl: '/api/health' } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Internal Server Error' }),
      }),
    );
  });
});
