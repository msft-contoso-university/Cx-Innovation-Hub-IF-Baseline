/**
 * Unit tests for concept/apps/api/src/routes/comments.js
 *
 * Covers the authorization (X-User-Id header) and ownership enforcement
 * (a user may only edit or delete their own comments). Uses a minimal
 * in-process HTTP server; the database service is replaced by vi.fn() mocks.
 */

import { createRequire } from 'node:module';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

// ── Paths ────────────────────────────────────────────────────────────────────
const apiPkg = require.resolve('../../../../apps/api/package.json');
const commentsRouterPath = require.resolve('../../../../apps/api/src/routes/comments.js');
const dbPath = require.resolve('../../../../apps/api/src/services/database.js');
const errorHandlerPath = require.resolve('../../../../apps/api/src/middleware/errorHandler.js');

// ── Database mock ─────────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockGetPool = vi.fn(() => ({ query: mockQuery }));

function patchLoader() {
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    try {
      const resolved = Module._resolveFilename(request, parent);
      if (resolved === dbPath) {
        return { getPool: mockGetPool };
      }
    } catch {
      // ignore resolution failures for built-ins / bare specifiers
    }
    return originalLoad(request, parent, isMain);
  };
}

function restoreLoader() {
  Module._load = originalLoad;
}

/** Load a fresh copy of the comments router with the DB mock in place. */
function loadCommentsRouter() {
  delete require.cache[commentsRouterPath];
  patchLoader();
  const router = require(commentsRouterPath);
  restoreLoader();
  return router;
}

interface ServerHandle {
  url: string;
  close: () => Promise<void>;
}

/** Start a minimal Express app containing the comments router + error handler. */
function startServer(router: unknown): Promise<ServerHandle> {
  const apiRequire = createRequire(apiPkg);
  const express = apiRequire('express');
  const { errorHandler } = require(errorHandlerPath);

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use(errorHandler);

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('comments route — authorization and input validation', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const router = loadCommentsRouter();
    ({ url: baseUrl, close } = await startServer(router));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/tasks/:taskId/comments ─────────────────────────────────────

  describe('POST /api/tasks/:taskId/comments', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const body = { content: 'This looks great!' };

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/1/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('X-User-Id header is required');
    });

    it('returns 400 when comment content is absent', async () => {
      // Arrange
      const body = {};

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/1/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'user-abc',
        },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Comment content is required');
    });

    it('returns 400 when comment content is whitespace only', async () => {
      // Arrange
      const body = { content: '   ' };

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/1/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'user-abc',
        },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Comment content is required');
    });
  });

  // ── PUT /api/comments/:id ─────────────────────────────────────────────────

  describe('PUT /api/comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Arrange
      const body = { content: 'Updated comment text' };

      // Act
      const resp = await fetch(`${baseUrl}/api/comments/10`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('X-User-Id header is required');
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange — ownership SELECT returns no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const body = { content: 'Updated comment text' };

      // Act
      const resp = await fetch(`${baseUrl}/api/comments/999`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'user-abc',
        },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(404);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Comment not found');
    });

    it('returns 403 when the caller is not the comment author', async () => {
      // Arrange — comment owned by a different user
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-xyz' }] });
      const body = { content: 'Trying to edit someone else' };

      // Act
      const resp = await fetch(`${baseUrl}/api/comments/10`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'attacker-abc', // different from owner-xyz
        },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(403);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('You can only edit your own comments');
    });

    it('returns 400 when content is empty after ownership check passes', async () => {
      // Arrange — comment owned by the requesting user
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-abc' }] });
      const body = { content: '' };

      // Act
      const resp = await fetch(`${baseUrl}/api/comments/10`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'user-abc',
        },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Comment content is required');
    });
  });

  // ── DELETE /api/comments/:id ─────────────────────────────────────────────

  describe('DELETE /api/comments/:id', () => {
    it('returns 400 when X-User-Id header is missing', async () => {
      // Act
      const resp = await fetch(`${baseUrl}/api/comments/10`, {
        method: 'DELETE',
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('X-User-Id header is required');
    });

    it('returns 404 when the comment does not exist', async () => {
      // Arrange — ownership SELECT returns no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      const resp = await fetch(`${baseUrl}/api/comments/999`, {
        method: 'DELETE',
        headers: { 'X-User-Id': 'user-abc' },
      });

      // Assert
      expect(resp.status).toBe(404);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Comment not found');
    });

    it('returns 403 when the caller is not the comment author', async () => {
      // Arrange — comment owned by a different user
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'owner-xyz' }] });

      // Act
      const resp = await fetch(`${baseUrl}/api/comments/10`, {
        method: 'DELETE',
        headers: { 'X-User-Id': 'attacker-abc' },
      });

      // Assert
      expect(resp.status).toBe(403);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('You can only delete your own comments');
    });
  });
});
