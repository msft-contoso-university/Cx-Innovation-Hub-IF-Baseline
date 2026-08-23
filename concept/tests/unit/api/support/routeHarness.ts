// =============================================================================
// Route Test Harness
// =============================================================================
// Loads an Express route module from concept/apps/api/src/routes with `express`
// and the database service replaced by lightweight in-memory doubles, so route
// handlers can be exercised without a running server or database.
//
// Uses the same Module._load interception pattern as api/services/database.spec.ts.
// =============================================================================

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

export type QueryResult = { rows: unknown[] };

/** Records a query issued by a route handler. */
export interface RecordedQuery {
  text: string;
  params: unknown[];
}

/** Responds to a query with a result, or throws to simulate a database failure. */
export type QueryResponder = (query: RecordedQuery) => QueryResult;

export interface FakeRequest {
  method?: string;
  originalUrl?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface InvokeResult {
  /** Status code passed to res.status(), defaults to 200 when not set. */
  status: number;
  /** Payload passed to res.json(), or undefined when json() was not called. */
  body: any;
  /** Error forwarded to next(), or undefined when the handler succeeded. */
  error: any;
  /** Queries issued during the invocation, in order. */
  queries: RecordedQuery[];
}

type Handler = (req: any, res: any, next: any) => unknown;

interface RegisteredRoute {
  method: string;
  path: string;
  handler: Handler;
}

export interface RouteHarness {
  invoke(method: string, path: string, req?: FakeRequest): Promise<InvokeResult>;
}

/**
 * Loads a route module (e.g. 'tasks') with mocked dependencies.
 *
 * @param routeName - file name under apps/api/src/routes, without extension
 * @param responder - returns the result for each query, in call order
 */
export function loadRouter(routeName: string, responder: QueryResponder): RouteHarness {
  const routes: RegisteredRoute[] = [];
  const queries: RecordedQuery[] = [];

  const fakeRouter: Record<string, unknown> = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    fakeRouter[method] = (path: string, ...handlers: Handler[]) => {
      routes.push({ method, path, handler: handlers[handlers.length - 1] });
    };
  }

  const fakePool = {
    query: (text: string, params: unknown[] = []) => {
      const recorded: RecordedQuery = { text, params };
      queries.push(recorded);
      return Promise.resolve(responder(recorded));
    },
  };

  const routeModulePath = require.resolve(
    `../../../../apps/api/src/routes/${routeName}.js`
  );
  delete require.cache[routeModulePath];

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
    require(routeModulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[routeModulePath];
  }

  return {
    async invoke(method: string, path: string, req: FakeRequest = {}): Promise<InvokeResult> {
      const route = routes.find(
        (candidate) => candidate.method === method.toLowerCase() && candidate.path === path
      );
      if (!route) {
        throw new Error(`Route not registered: ${method.toUpperCase()} ${path}`);
      }

      const before = queries.length;
      const result: InvokeResult = { status: 200, body: undefined, error: undefined, queries: [] };

      const res = {
        status(code: number) {
          result.status = code;
          return res;
        },
        json(payload: unknown) {
          result.body = payload;
          return res;
        },
      };

      await route.handler(
        {
          method: method.toUpperCase(),
          originalUrl: path,
          params: {},
          body: {},
          headers: {},
          ...req,
        },
        res,
        (err: unknown) => {
          result.error = err;
        }
      );

      result.queries = queries.slice(before);
      return result;
    },
  };
}

/** Builds a responder that returns the given results in order. */
export function respondInOrder(results: QueryResult[]): QueryResponder {
  let index = 0;
  return () => {
    if (index >= results.length) {
      throw new Error(`Unexpected query #${index + 1}: no result configured`);
    }
    return results[index++];
  };
}
