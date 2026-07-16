/**
 * Shared helpers for Express route unit tests.
 *
 * Pattern: uses Module._load interception (CJS) to inject a mock database pool,
 * then loads the target route module fresh per test suite. Route handlers are
 * extracted from router.stack without needing a running HTTP server or supertest.
 */

import { createRequire } from 'node:module';
import { vi } from 'vitest';
import path from 'node:path';

export const require = createRequire(import.meta.url);
export const Module = require('module');
export const originalLoad = Module._load;

// Absolute path of the database service so we can intercept it regardless of
// how it is required (relative or absolute) from within route files.
export const databaseModulePath = require.resolve(
  '../../../../apps/api/src/services/database.js',
);

/**
 * Creates a mock pool whose `query` function is a fresh vi.fn().
 * Returns both the pool and the query mock so tests can set up return values.
 */
export function createMockPool() {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery };
  return { mockPool, mockQuery };
}

/**
 * Installs a Module._load interceptor that returns the supplied mock database
 * module whenever the database service is required from any child module.
 * Returns a teardown function that restores the original loader.
 */
export function interceptDatabase(mockDatabaseModule: Record<string, unknown>) {
  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    // Resolve the request to an absolute path so relative vs absolute requires
    // both match correctly.
    if (parent && typeof (parent as any).filename === 'string') {
      let resolved: string;
      try {
        resolved = Module._resolveFilename(request, parent, isMain);
      } catch {
        return originalLoad(request, parent, isMain);
      }
      if (resolved === databaseModulePath) {
        return mockDatabaseModule;
      }
    }
    return originalLoad(request, parent, isMain);
  };

  return () => {
    Module._load = originalLoad;
  };
}

/**
 * Loads a route module fresh (clears require.cache) with the database
 * intercepted. Call teardown() in afterEach to restore the loader.
 */
export async function loadRouteModule(
  routeModulePath: string,
  mockDatabaseModule: Record<string, unknown>,
) {
  delete require.cache[routeModulePath];
  delete require.cache[databaseModulePath];
  const teardown = interceptDatabase(mockDatabaseModule);
  const router = require(routeModulePath);
  return { router, teardown };
}

/**
 * Finds and returns the last handler registered for a given HTTP method and
 * path on an Express Router. Throws if the route is not found.
 */
export function getRouteHandler(router: any, method: string, routePath: string) {
  for (const layer of router.stack) {
    if (
      layer.route &&
      layer.route.path === routePath &&
      layer.route.methods[method.toLowerCase()]
    ) {
      const handlers = layer.route.stack;
      return handlers[handlers.length - 1].handle;
    }
  }
  throw new Error(`Route handler not found: ${method.toUpperCase()} ${routePath}`);
}

/**
 * Creates a minimal mock Express response object compatible with the patterns
 * used in Taskify route handlers.
 */
export function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}
