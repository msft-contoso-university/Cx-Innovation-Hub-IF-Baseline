import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const expressModule = require('express');

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

/**
 * Loads an Express route module from `apps/api/src/routes` with its
 * `../services/database` dependency intercepted, so route handlers can be
 * exercised without a real database or an installed `express` copy inside
 * `apps/api`. Mirrors the module-loader interception pattern used by
 * `database.spec.ts`.
 */
export function loadRouteModule(routeModulePath: string, mockQuery: QueryFn) {
  const resolvedPath = require.resolve(routeModulePath);
  delete require.cache[resolvedPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return expressModule;
    }

    if (request === '../services/database') {
      return { getPool: () => ({ query: mockQuery }) };
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    return require(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }
}

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ method: string; handle: (...args: unknown[]) => unknown }>;
  };
}

/**
 * Extracts a single route handler function from an Express Router instance
 * so it can be invoked directly with mock req/res/next objects.
 */
export function getRouteHandler(router: { stack: RouteLayer[] }, method: string, path: string) {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === path && candidate.route?.methods[method]
  );

  if (!layer?.route) {
    throw new Error(`No handler registered for ${method.toUpperCase()} ${path}`);
  }

  const routeLayer = layer.route.stack.find((entry) => entry.method === method);
  if (!routeLayer) {
    throw new Error(`No handler registered for ${method.toUpperCase()} ${path}`);
  }

  return routeLayer.handle;
}

export function createMockReq(overrides: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
  return {
    params: overrides.params ?? {},
    body: overrides.body ?? {},
    headers: overrides.headers ?? {},
  };
}

export function createMockRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}
