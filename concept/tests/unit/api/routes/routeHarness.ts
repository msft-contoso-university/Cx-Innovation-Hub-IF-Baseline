// =============================================================================
// Route test harness
// =============================================================================
// Loads an Express route module from concept/apps/api with `express` and the
// database service replaced by in-memory test doubles, so handlers can be
// invoked directly without a running server or database.
//
// Mirrors the module-interception pattern used by api/services/database.spec.ts.
// =============================================================================

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

export type QueryMock = (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;

export interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

interface RecordedRoute {
  method: string;
  path: string;
  handler: (req: unknown, res: FakeResponse, next: (err?: unknown) => void) => Promise<void> | void;
}

export interface RouterHarness {
  routes: Array<{ method: string; path: string }>;
  queries: Array<{ sql: string; params: unknown[] }>;
  /** Invokes the handler registered for `method path` and returns the outcome. */
  call(
    method: string,
    path: string,
    req?: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string> }
  ): Promise<{ res: FakeResponse; error: { status?: number; message?: string } | undefined }>;
}

function createFakeResponse(): FakeResponse {
  return {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

/**
 * Loads a route module (file name relative to concept/apps/api/src/routes) with
 * a fake Express router and a stubbed database pool.
 *
 * @param routeFile - e.g. 'tasks.js'
 * @param query - stub for `getPool().query(sql, params)`
 */
export function loadRouter(routeFile: string, query: QueryMock): RouterHarness {
  const routes: RecordedRoute[] = [];
  const queries: Array<{ sql: string; params: unknown[] }> = [];

  const fakeRouter: Record<string, unknown> = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    fakeRouter[method] = (path: string, handler: RecordedRoute['handler']) => {
      routes.push({ method: method.toUpperCase(), path, handler });
    };
  }

  const pool = {
    query: (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return query(sql, params);
    },
  };

  const routeModulePath = require.resolve(`../../../../apps/api/src/routes/${routeFile}`);

  delete require.cache[routeModulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => fakeRouter };
    }

    if (request === '../services/database') {
      return { getPool: () => pool };
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    require(routeModulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[routeModulePath];
  }

  return {
    routes: routes.map(({ method, path }) => ({ method, path })),
    queries,
    async call(method, path, req = {}) {
      const route = routes.find((r) => r.method === method && r.path === path);
      if (!route) {
        throw new Error(`No route registered for ${method} ${path}`);
      }

      const res = createFakeResponse();
      let error: { status?: number; message?: string } | undefined;

      await route.handler(
        {
          method,
          originalUrl: path,
          params: req.params ?? {},
          body: req.body ?? {},
          headers: req.headers ?? {},
        },
        res,
        (err?: unknown) => {
          error = err as { status?: number; message?: string };
        }
      );

      return { res, error };
    },
  };
}
