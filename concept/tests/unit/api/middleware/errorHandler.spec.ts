import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

async function loadErrorHandlerModule() {
  delete require.cache[errorHandlerPath];
  Module._load = (request: string, parent: unknown, isMain: boolean) =>
    originalLoad(request, parent, isMain);
  return require(errorHandlerPath);
}

describe('createError', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('creates an error with the given status and message', async () => {
    // Arrange / Act
    const { createError } = await loadErrorHandlerModule();
    const err = createError(404, 'Not Found');

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not Found');
    expect((err as any).status).toBe(404);
  });

  it('creates a 400 error with the correct status', async () => {
    // Arrange / Act
    const { createError } = await loadErrorHandlerModule();
    const err = createError(400, 'Bad Request');

    // Assert
    expect((err as any).status).toBe(400);
    expect(err.message).toBe('Bad Request');
  });

  it('creates a 403 error with the correct status', async () => {
    // Arrange / Act
    const { createError } = await loadErrorHandlerModule();
    const err = createError(403, 'Forbidden');

    // Assert
    expect((err as any).status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});

describe('errorHandler middleware', () => {
  afterEach(() => {
    Module._load = originalLoad;
  });

  it('responds with the error status and message', async () => {
    // Arrange
    const { errorHandler } = await loadErrorHandlerModule();
    const err = Object.assign(new Error('Project not found'), { status: 404 });
    const req = { method: 'GET', originalUrl: '/api/projects/999' };
    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn();
    const res = { status: statusMock, json: jsonMock } as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({ error: { status: 404, message: 'Project not found' } });
  });

  it('defaults to 500 when error has no status', async () => {
    // Arrange
    const { errorHandler } = await loadErrorHandlerModule();
    const err = new Error('Unexpected failure');
    const req = { method: 'POST', originalUrl: '/api/projects' };
    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn();
    const res = { status: statusMock, json: jsonMock } as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: { status: 500, message: 'Unexpected failure' } });
  });

  it('uses "Internal Server Error" when error has no message', async () => {
    // Arrange
    const { errorHandler } = await loadErrorHandlerModule();
    const err = {} as any;
    const req = { method: 'GET', originalUrl: '/api/health' };
    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn();
    const res = { status: statusMock, json: jsonMock } as any;
    const next = vi.fn();

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: { status: 500, message: 'Internal Server Error' } });
  });
});
