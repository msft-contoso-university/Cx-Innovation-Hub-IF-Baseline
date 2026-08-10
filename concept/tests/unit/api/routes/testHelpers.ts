import { createRequire } from 'node:module';
import { vi } from 'vitest';

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire('module');
const originalLoad = Module._load;

const ROUTER_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * Minimal stand-in for an Express `Router`. Route modules only use
 * `Router().{get,post,put,patch,delete}(path, handler)` and export the
 * resulting router, so we only need to reproduce the `router.stack` shape
 * that `getRouteHandler` below (and Express itself) relies on. This avoids
 * a hard dependency on the real `express` package being installed under
 * `concept/tests/unit` (the CI unit-testing job only runs `npm ci` there,
 * not in `concept/apps/api`).
 */
function createFakeRouter() {
  const router: any = { stack: [] };
  for (const method of ROUTER_METHODS) {
    router[method] = (path: string, handler: (...args: unknown[]) => unknown) => {
      router.stack.push({
        route: {
          path,
          methods: { [method]: true },
          stack: [{ handle: handler }],
        },
      });
      return router;
    };
  }
  return router;
}

/**
 * Loads an Express route module (CommonJS) with `../services/database`
 * intercepted to return a fake `getPool()` that resolves to the given
 * mock pool object, and `express` intercepted to return a fake `Router`
 * (see `createFakeRouter`). Mirrors the module-loader interception pattern
 * used in `concept/tests/unit/api/services/database.spec.ts`.
 */
export function loadRouterWithMockPool(routeModulePath: string, mockPool: unknown) {
  const resolvedPath = nodeRequire.resolve(routeModulePath);
  delete nodeRequire.cache[resolvedPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: () => mockPool };
    }
    if (request === 'express') {
      return { Router: createFakeRouter };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return nodeRequire(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }
}

/**
 * Finds the final handler function for a given HTTP method + route path
 * registered on a router produced by `loadRouterWithMockPool`.
 */
export function getRouteHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`No handler registered for ${method.toUpperCase()} ${path}`);
  }
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

export function createMockResponse() {
  const res: any = {
    statusCode: 200,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

export function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  };
}
