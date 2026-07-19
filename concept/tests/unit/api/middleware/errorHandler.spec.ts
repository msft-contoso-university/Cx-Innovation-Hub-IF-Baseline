import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createError, errorHandler } = require('../../../../apps/api/src/middleware/errorHandler.js');

describe('createError', () => {
  it('returns an Error instance with the given status and message', () => {
    // Arrange / Act
    const err = createError(404, 'Not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('creates a 400 Bad Request error', () => {
    const err = createError(400, 'Bad request');

    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('creates a 403 Forbidden error', () => {
    const err = createError(403, 'Forbidden');

    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});

describe('errorHandler', () => {
  it('responds with the error status and message from a structured error', () => {
    // Arrange
    const err = createError(404, 'Not found');
    const req = { method: 'GET', originalUrl: '/api/test' };
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 404, message: 'Not found' } });
  });

  it('defaults to status 500 when the error has no status property', () => {
    // Arrange
    const err = new Error('Unexpected failure');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { status: 500, message: 'Unexpected failure' } });
  });

  it('uses "Internal Server Error" when the error message is empty', () => {
    // Arrange
    const err = new Error('');
    (err as any).status = 500;
    const req = { method: 'GET', originalUrl: '/api/health' };
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: 'Internal Server Error' }) })
    );
  });
});
