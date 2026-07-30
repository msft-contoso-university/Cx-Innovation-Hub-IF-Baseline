import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

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
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('attaches a 400 status for bad-request errors', () => {
    const err = createError(400, 'Name is required');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Name is required');
  });

  it('attaches a 403 status for forbidden errors', () => {
    const err = createError(403, 'Forbidden');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('attaches a 500 status for server errors', () => {
    const err = createError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  function makeRes() {
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  }

  function makeReq(method = 'GET', originalUrl = '/api/things') {
    return { method, originalUrl };
  }

  it('sends the error status and message as JSON', () => {
    // Arrange
    const err = createError(404, 'Resource not found');
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 404, message: 'Resource not found' },
    });
  });

  it('defaults to status 500 when err.status is absent', () => {
    // Arrange
    const err = new Error('Something exploded');
    const req = makeReq('POST', '/api/items');
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 500, message: 'Something exploded' },
    });
  });

  it('defaults message to "Internal Server Error" when err.message is absent', () => {
    // Arrange
    const err: { status: number; message?: string } = { status: 503 };
    const req = makeReq('GET', '/api/health');
    const res = makeRes();
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { status: 503, message: 'Internal Server Error' },
    });
  });
});
