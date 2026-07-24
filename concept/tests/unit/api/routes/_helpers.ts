/**
 * Shared helpers for Express route unit tests.
 *
 * Routes are CommonJS modules that require `../services/database`.
 * We intercept Module._load to inject a mock pool before loading each router.
 */

import { createRequire } from 'node:module';
import { vi } from 'vitest';

export const require = createRequire(import.meta.url);
export const Module = require('module');
export const originalLoad = Module._load;

/** Minimal mock response object compatible with our route handlers. */
export function makeMockRes() {
  const res = {
    statusCode: 200,
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

/**
 * Invoke a route handler via router.handle and wait for either
 * next() or res.json() to be called (handles async handlers).
 */
export function routeHandle(
  router: { handle: Function },
  req: Record<string, unknown>,
  res: ReturnType<typeof makeMockRes>,
): Promise<{ next: ReturnType<typeof vi.fn> }> {
  return new Promise((resolve) => {
    const next = vi.fn().mockImplementation(() => resolve({ next }));
    res.json.mockImplementation(() => {
      resolve({ next });
      return res;
    });
    router.handle(req, res, next);
  });
}

/**
 * Load a route module with the database service mocked.
 * Returns the router and the mockQuery function.
 */
export async function loadRouterWithMockedDb(
  routeModulePath: string,
  dbModulePath: string,
  mockQuery: ReturnType<typeof vi.fn>,
) {
  delete require.cache[routeModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    // Intercept the database service to avoid real DB connections
    const resolved = (() => {
      try { return Module._resolveFilename(request, parent); } catch { return ''; }
    })();
    if (resolved === dbModulePath) {
      return { getPool: () => ({ query: mockQuery }) };
    }
    return originalLoad(request, parent, isMain);
  };

  const router = require(routeModulePath);
  Module._load = originalLoad;
  return router;
}
