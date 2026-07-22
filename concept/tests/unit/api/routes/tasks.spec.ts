/**
 * Unit tests for concept/apps/api/src/routes/tasks.js
 *
 * Tests input validation and 404 handling using a minimal in-process HTTP
 * server. The database service is replaced by a vi.fn() mock so no real
 * database connection is required.
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
const tasksRouterPath = require.resolve('../../../../apps/api/src/routes/tasks.js');
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Load a fresh copy of the tasks router with the DB mock in place. */
function loadTasksRouter() {
  delete require.cache[tasksRouterPath];
  patchLoader();
  const router = require(tasksRouterPath);
  restoreLoader();
  return router;
}

interface ServerHandle {
  url: string;
  close: () => Promise<void>;
}

/** Start a minimal Express app containing the tasks router + error handler. */
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

describe('tasks route — input validation and error paths', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const router = loadTasksRouter();
    ({ url: baseUrl, close } = await startServer(router));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/projects/:projectId/tasks ──────────────────────────────────

  describe('POST /api/projects/:projectId/tasks', () => {
    it('returns 400 when title is absent', async () => {
      // Arrange
      const body = { description: 'no title given' };

      // Act
      const resp = await fetch(`${baseUrl}/api/projects/1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Task title is required');
    });

    it('returns 400 when title is whitespace only', async () => {
      // Arrange
      const body = { title: '   ' };

      // Act
      const resp = await fetch(`${baseUrl}/api/projects/1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Task title is required');
    });
  });

  // ── PUT /api/tasks/:id ───────────────────────────────────────────────────

  describe('PUT /api/tasks/:id', () => {
    it('returns 400 when title is absent', async () => {
      // Arrange
      const body = { description: 'updated description' };

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/42`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Task title is required');
    });

    it('returns 404 when the task does not exist', async () => {
      // Arrange — DB UPDATE returns no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/999`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated title' }),
      });

      // Assert
      expect(resp.status).toBe(404);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Task not found');
    });
  });

  // ── PATCH /api/tasks/:id/status ──────────────────────────────────────────

  describe('PATCH /api/tasks/:id/status', () => {
    it('returns 400 for an invalid status value', async () => {
      // Arrange
      const body = { status: 'invalid_status', position: 0 };

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/1/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toMatch(/Invalid status/);
    });

    it('returns 400 when position is missing', async () => {
      // Arrange
      const body = { status: 'in_progress' };

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/1/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Position is required');
    });

    it('returns 400 when status is missing entirely', async () => {
      // Arrange
      const body = { position: 0 };

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/1/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Assert
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error.message).toMatch(/Invalid status/);
    });

    it('accepts all four valid status values', async () => {
      // Arrange — DB UPDATE returns a row, then a row for the JOIN query
      const taskRow = { id: '1', status: 'done', position: 0 };
      for (const status of ['todo', 'in_progress', 'in_review', 'done']) {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ ...taskRow, status }] }) // UPDATE
          .mockResolvedValueOnce({ rows: [{ ...taskRow, status }] }); // SELECT with JOIN

        // Act
        const resp = await fetch(`${baseUrl}/api/tasks/1/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, position: 0 }),
        });

        // Assert
        expect(resp.status).toBe(200);
      }
    });
  });

  // ── DELETE /api/tasks/:id ────────────────────────────────────────────────

  describe('DELETE /api/tasks/:id', () => {
    it('returns 404 when the task does not exist', async () => {
      // Arrange — DB DELETE returns no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      const resp = await fetch(`${baseUrl}/api/tasks/999`, {
        method: 'DELETE',
      });

      // Assert
      expect(resp.status).toBe(404);
      const data = await resp.json() as any;
      expect(data.error.message).toBe('Task not found');
    });
  });
});
