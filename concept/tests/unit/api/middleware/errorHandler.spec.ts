/**
 * Unit tests for concept/apps/api/src/middleware/errorHandler.js
 *
 * The error handler shapes every API failure response, so a regression here
 * has a broad blast radius across all routes.
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { errorHandler, createError } = require('../../../../apps/api/src/middleware/errorHandler.js');

function createResponse() {
  const res = {
    statusCode: 200 as number,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };

  return res;
}

const req = { method: 'POST', originalUrl: '/api/projects' };

describe('createError', () => {
  it('attaches the HTTP status to the error', () => {
    // Arrange & Act
    const err = createError(404, 'Project not found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Project not found');
  });
});

describe('errorHandler', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('uses the status and message from the error', () => {
    // Arrange
    const res = createResponse();

    // Act
    errorHandler(createError(403, 'You can only edit your own comments'), req, res, () => {});

    // Assert
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: { status: 403, message: 'You can only edit your own comments' },
    });
  });

  it('defaults to 500 with a generic message for unclassified errors', () => {
    // Arrange
    const res = createResponse();
    const err = new Error('');

    // Act
    errorHandler(err, req, res, () => {});

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { status: 500, message: 'Internal Server Error' },
    });
  });

  it('logs the stack trace only for 500 responses', () => {
    // Arrange
    const serverRes = createResponse();
    const clientRes = createResponse();

    // Act
    errorHandler(new Error('boom'), req, serverRes, () => {});
    const serverLogCalls = consoleError.mock.calls.length;
    consoleError.mockClear();
    errorHandler(createError(400, 'Task title is required'), req, clientRes, () => {});

    // Assert
    expect(serverLogCalls).toBe(2); // summary line + stack
    expect(consoleError).toHaveBeenCalledTimes(1); // summary line only
  });
});
