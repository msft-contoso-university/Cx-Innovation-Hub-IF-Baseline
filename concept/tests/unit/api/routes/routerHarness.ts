/**
 * Test harness for the Express route modules under apps/api/src/routes.
 *
 * The API sources are CommonJS and their dependencies (express, pg) are not
 * installed in this test workspace, so the harness intercepts `require` the
 * same way api/services/database.spec.ts does. It substitutes a minimal
 * Router stub that records handlers, plus a stubbed database service whose
 * pool returns queued query results.
 *
 * Each harness instance is fully isolated: the module cache entry is dropped
 * before loading and `Module._load` is restored by `dispose()`.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('module');

type Handler = (req: any, res: any, next: (err?: unknown) => void) => unknown;

export interface QueryCall {
  text: string;
  params: unknown[];
}

export interface InvokeResult {
  statusCode: number;
  body: unknown;
  error: any;
}

export interface RouteHarness {
  invoke(
    method: string,
    path: string,
    request?: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string> },
  ): Promise<InvokeResult>;
  queueQueryResult(result: unknown): void;
  queueQueryError(error: Error): void;
  readonly queries: QueryCall[];
  dispose(): void;
}

const ROUTE_MODULES = {
  tasks: '../../../../apps/api/src/routes/tasks.js',
  comments: '../../../../apps/api/src/routes/comments.js',
  projects: '../../../../apps/api/src/routes/projects.js',
  users: '../../../../apps/api/src/routes/users.js',
} as const;

export type RouteModuleName = keyof typeof ROUTE_MODULES;

export function loadRoute(name: RouteModuleName): RouteHarness {
  const modulePath = require.resolve(ROUTE_MODULES[name]);
  const databasePath = require.resolve('../../../../apps/api/src/services/database.js');
  const originalLoad = Module._load;

  const routes = new Map<string, Handler>();
  const queries: QueryCall[] = [];
  const queued: Array<{ result?: unknown; error?: Error }> = [];

  const router: Record<string, unknown> = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (path: string, handler: Handler) => {
      routes.set(`${method.toUpperCase()} ${path}`, handler);
    };
  }

  const pool = {
    query: async (text: string, params: unknown[] = []) => {
      queries.push({ text, params });
      const next = queued.shift();
      if (!next) {
        throw new Error(`Unexpected query with no queued result: ${text}`);
      }
      if (next.error) {
        throw next.error;
      }
      return next.result;
    },
  };

  delete require.cache[modulePath];
  delete require.cache[databasePath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: () => router };
    }

    if (request === '../services/database') {
      return { getPool: () => pool };
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    require(modulePath);
  } finally {
    Module._load = originalLoad;
  }

  return {
    queries,
    queueQueryResult(result: unknown) {
      queued.push({ result });
    },
    queueQueryError(error: Error) {
      queued.push({ error });
    },
    async invoke(method, path, request = {}) {
      const handler = routes.get(`${method.toUpperCase()} ${path}`);
      if (!handler) {
        throw new Error(`Route not registered: ${method.toUpperCase()} ${path}`);
      }

      const result: InvokeResult = { statusCode: 200, body: undefined, error: undefined };
      const res = {
        status(code: number) {
          result.statusCode = code;
          return res;
        },
        json(payload: unknown) {
          result.body = payload;
          return res;
        },
      };

      await handler(
        {
          method: method.toUpperCase(),
          params: request.params ?? {},
          body: request.body ?? {},
          headers: request.headers ?? {},
        },
        res,
        (err?: unknown) => {
          result.error = err;
        },
      );

      return result;
    },
    dispose() {
      Module._load = originalLoad;
      delete require.cache[modulePath];
      delete require.cache[databasePath];
    },
  };
}
