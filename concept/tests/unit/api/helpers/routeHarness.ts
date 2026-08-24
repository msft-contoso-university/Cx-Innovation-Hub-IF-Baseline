/**
 * Test harness for the Express route modules under concept/apps/api/src/routes.
 *
 * The API is a CommonJS Express app whose dependencies (`express`, `pg`) are not
 * installed in this test workspace, so the harness intercepts `Module._load`
 * (same technique as api/services/database.spec.ts) to provide:
 *   - a fake `express.Router` that records the registered handlers
 *   - a fake database service whose `getPool().query` is a Vitest mock
 *
 * Every load is isolated: the module cache is cleared and a fresh set of mocks
 * is returned, so tests never share mutable state.
 */

import { createRequire } from 'node:module';
import { expect, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type RouteHandler = (req: any, res: any, next: any) => unknown;

interface RegisteredRoute {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
}

export interface FakeResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => FakeResponse;
}

export interface LoadedRouter {
  /** Invokes the handler registered for the given method + path. */
  invoke: (
    method: HttpMethod,
    path: string,
    req: Record<string, unknown>,
  ) => Promise<{ res: FakeResponse; next: ReturnType<typeof vi.fn> }>;
  /** Mock behind `getPool().query`. */
  query: ReturnType<typeof vi.fn>;
  routes: RegisteredRoute[];
}

export function createResponse(): FakeResponse {
  const res: FakeResponse = {
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

export function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    method: 'GET',
    originalUrl: '/api/test',
    ...overrides,
  };
}

/**
 * Loads a route module (e.g. 'comments') with mocked express + database.
 */
export function loadRouter(routeName: string): LoadedRouter {
  const routeModulePath = require.resolve(
    `../../../../apps/api/src/routes/${routeName}.js`,
  );
  const databaseModulePath = require.resolve(
    '../../../../apps/api/src/services/database.js',
  );

  const routes: RegisteredRoute[] = [];
  const query = vi.fn();

  const router: Record<string, unknown> = {};
  (['get', 'post', 'put', 'patch', 'delete'] as HttpMethod[]).forEach((method) => {
    router[method] = (path: string, handler: RouteHandler) => {
      routes.push({ method, path, handler });
      return router;
    };
  });

  const originalLoad = Module._load;

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => router };
    }

    if (request === '../services/database') {
      return { getPool: () => ({ query }) };
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[routeModulePath];
    delete require.cache[databaseModulePath];
    require(routeModulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[routeModulePath];
  }

  async function invoke(
    method: HttpMethod,
    path: string,
    reqOverrides: Record<string, unknown>,
  ) {
    const route = routes.find((r) => r.method === method && r.path === path);
    if (!route) {
      throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
    }

    const res = createResponse();
    const next = vi.fn();
    await route.handler(createRequest(reqOverrides), res, next);

    return { res, next };
  }

  return { invoke, query, routes };
}

/** Extracts the error passed to `next(...)` by a route handler. */
export function nextError(next: ReturnType<typeof vi.fn>): Error & { status?: number } {
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0][0] as Error & { status?: number };
}
