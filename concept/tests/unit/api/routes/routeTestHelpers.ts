import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

export type MockPool = {
  query: (...args: unknown[]) => Promise<{ rows: unknown[] }>;
};

/**
 * Loads a CommonJS Express router module while intercepting its
 * `require("../services/database")` call so tests can control `getPool()`
 * without touching a real database connection.
 *
 * Mirrors the module-loader interception pattern documented in the
 * unit-testing-framework skill (see database.spec.ts) to reliably mock
 * CommonJS dependencies instantiated relative to the required module.
 */
export function loadRouterWithMockedPool(routerModulePath: string, pool: MockPool) {
  const resolvedPath = require.resolve(routerModulePath);
  delete require.cache[resolvedPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === '../services/database') {
      return { getPool: () => pool };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }
}

export interface RouterLike {
  stack: Array<{
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown }>;
    };
  }>;
}

/**
 * Finds a route handler on an Express Router by HTTP method + path and
 * returns its handler function for direct invocation in tests.
 */
export function findRouteHandler(router: RouterLike, method: string, path: string) {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods[method.toLowerCase()]
  );

  if (!layer || !layer.route) {
    throw new Error(`No route handler found for ${method.toUpperCase()} ${path}`);
  }

  return layer.route.stack[0].handle;
}

export function createMockResponse() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: undefined,
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
