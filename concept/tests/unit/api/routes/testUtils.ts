// =============================================================================
// Shared test utilities for API route unit tests.
// =============================================================================
// These routes are built with Express Router, but the CI unit-test job only
// installs concept/tests/unit dependencies (no `express`/`pg` packages are
// available). To keep tests hermetic and dependency-free we intercept the
// `express` and `../services/database` requires at load time (same pattern as
// concept/tests/unit/api/services/database.spec.ts) with lightweight fakes
// that record route registrations and let us control query results.
// =============================================================================
import { createRequire } from 'node:module';
import { vi } from 'vitest';

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire('module');
const originalLoad = Module._load;

export type RouteHandler = (
  req: Record<string, unknown>,
  res: FakeResponse,
  next: (err?: unknown) => void
) => unknown;

export interface RegisteredRoute {
  method: string;
  path: string;
  handler: RouteHandler;
}

export interface FakeRouter {
  get: (path: string, handler: RouteHandler) => void;
  post: (path: string, handler: RouteHandler) => void;
  put: (path: string, handler: RouteHandler) => void;
  patch: (path: string, handler: RouteHandler) => void;
  delete: (path: string, handler: RouteHandler) => void;
  routes: RegisteredRoute[];
}

export function createFakeRouter(): FakeRouter {
  const routes: RegisteredRoute[] = [];
  const router = { routes } as FakeRouter;
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    router[method] = (path: string, handler: RouteHandler) => {
      routes.push({ method, path, handler });
    };
  }
  return router;
}

export function findRoute(router: FakeRouter, method: string, path: string): RouteHandler {
  const route = router.routes.find(
    (r) => r.method === method.toLowerCase() && r.path === path
  );
  if (!route) {
    throw new Error(`Route ${method} ${path} was not registered`);
  }
  return route.handler;
}

export class FakeResponse {
  statusCode = 200;
  body: unknown;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown) {
    this.body = payload;
    return this;
  }
}

/**
 * Loads a route module with `express` and `../services/database` mocked out.
 * Returns the fake router (which also exposes `.routes`) and the mock pool
 * query function so tests can control database responses.
 */
export async function loadRouteModule(modulePath: string) {
  const resolvedPath = nodeRequire.resolve(modulePath);
  delete nodeRequire.cache[resolvedPath];

  const fakeRouter = createFakeRouter();
  const mockQuery = vi.fn();
  const mockGetPool = vi.fn(() => ({ query: mockQuery }));

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => fakeRouter };
    }
    if (request === '../services/database') {
      return { getPool: mockGetPool };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    nodeRequire(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }

  return { router: fakeRouter, mockQuery, mockGetPool };
}
