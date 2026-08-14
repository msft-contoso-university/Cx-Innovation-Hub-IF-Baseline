/**
 * Shared harness for testing the CommonJS Express route modules without
 * installing Express or touching a database.
 *
 * Follows the module-loader interception pattern documented in
 * .github/skills/unit-testing-framework/SKILL.md: `Module._load` is patched so
 * `express` and the database service are replaced by deterministic test
 * doubles, and the route module is cleared from `require.cache` per load.
 */

import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

export type RouteHandler = (req: any, res: any, next: any) => Promise<void> | void;

export interface LoadedRoutes {
  /** Registered handlers keyed by `METHOD path`, e.g. `PUT /tasks/:id`. */
  handlers: Map<string, RouteHandler>;
  /** Mock of `pool.query`, resolving the queued responses in order. */
  query: ReturnType<typeof vi.fn>;
}

/**
 * Loads a route module from apps/api/src/routes with mocked dependencies.
 *
 * @param routeFile - Route file name, e.g. `tasks.js`.
 * @param queryResults - Query results returned in call order by `pool.query`.
 */
export function loadRouteModule(routeFile: string, queryResults: unknown[] = []): LoadedRoutes {
  const handlers = new Map<string, RouteHandler>();
  const remaining = [...queryResults];

  const query = vi.fn(async () => {
    if (remaining.length === 0) {
      throw new Error('Unexpected database query: no queued result');
    }
    const next = remaining.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });

  const register = (method: string) => (path: string, ...rest: RouteHandler[]) => {
    handlers.set(`${method} ${path}`, rest[rest.length - 1]);
  };

  const routerStub = {
    get: register('GET'),
    post: register('POST'),
    put: register('PUT'),
    patch: register('PATCH'),
    delete: register('DELETE'),
  };

  const modulePath = require.resolve(`../../../../apps/api/src/routes/${routeFile}`);
  delete require.cache[modulePath];

  Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === 'express') {
      return { Router: () => routerStub };
    }

    if (request === '../services/database') {
      return { getPool: () => ({ query }) };
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    require(modulePath);
  } finally {
    Module._load = originalLoad;
  }

  return { handlers, query };
}

export function restoreModuleLoader(): void {
  Module._load = originalLoad;
}

export interface FakeResponse {
  statusCode: number | null;
  body: unknown;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => FakeResponse;
}

export function createResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: null,
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
    ...overrides,
  } as any;
}
