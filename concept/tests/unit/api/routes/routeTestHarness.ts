// =============================================================================
// Route Test Harness
// =============================================================================
// The API route modules are CommonJS and build an Express Router at import
// time. Following the repo's CommonJS mocking pattern (see
// api/services/database.spec.ts), we patch Module._load so that `express` and
// the database service are replaced with deterministic test doubles. This lets
// route handlers be invoked directly with fake req/res/next objects — no
// network, no database, no Express runtime dependency.
// =============================================================================

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

export type RouteHandler = (
  req: FakeRequest,
  res: FakeResponse,
  next: (err?: unknown) => void
) => unknown;

export interface FakeRequest {
  params: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface FakeResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => FakeResponse;
}

export interface QueryCall {
  sql: string;
  params: unknown[];
}

export type QueryHandler = (call: QueryCall) => { rows: unknown[] } | Promise<{ rows: unknown[] }>;

export interface LoadedRoutes {
  /** Every recorded query with its SQL text and bound parameters. */
  queries: QueryCall[];
  /** Look up a registered handler by HTTP method and route path. */
  handler: (method: string, path: string) => RouteHandler;
}

/**
 * Loads a route module from apps/api/src/routes with stubbed dependencies.
 *
 * @param routeFile - file name inside apps/api/src/routes (e.g. "tasks.js")
 * @param onQuery - test double invoked for every pool.query() call
 */
export function loadRoutes(routeFile: string, onQuery: QueryHandler): LoadedRoutes {
  const modulePath = require.resolve(`../../../../apps/api/src/routes/${routeFile}`);
  const registered = new Map<string, RouteHandler>();
  const queries: QueryCall[] = [];

  const fakeRouter: Record<string, unknown> = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    fakeRouter[method] = (path: string, handler: RouteHandler) => {
      registered.set(`${method.toUpperCase()} ${path}`, handler);
    };
  }

  const fakePool = {
    query: async (sql: string, params: unknown[] = []) => {
      const call: QueryCall = { sql, params };
      queries.push(call);
      return onQuery(call);
    },
  };

  delete require.cache[modulePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => fakeRouter };
    }

    if (request === '../services/database') {
      return { getPool: () => fakePool };
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    require(modulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }

  return {
    queries,
    handler(method: string, path: string) {
      const key = `${method.toUpperCase()} ${path}`;
      const found = registered.get(key);
      if (!found) {
        throw new Error(`Route not registered: ${key}`);
      }
      return found;
    },
  };
}

/** Builds a fake Express request. Header keys are lower-cased, as Express does. */
export function createRequest(overrides: Partial<FakeRequest> = {}): FakeRequest {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides.headers ?? {})) {
    headers[key.toLowerCase()] = value;
  }

  return {
    params: overrides.params ?? {},
    body: overrides.body ?? {},
    headers,
  };
}

/** Builds a fake Express response that records status code and JSON payload. */
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

/** Collects the error passed to next(), if any. */
export function createNext() {
  const calls: unknown[] = [];
  const next = (err?: unknown) => {
    calls.push(err);
  };

  // defineProperty (not Object.assign) so `error` stays a live getter.
  return Object.defineProperty(Object.assign(next, { calls }), 'error', {
    get(): { status?: number; message?: string } | undefined {
      return calls[0] as { status?: number; message?: string } | undefined;
    },
  }) as typeof next & {
    calls: unknown[];
    readonly error: { status?: number; message?: string } | undefined;
  };
}
