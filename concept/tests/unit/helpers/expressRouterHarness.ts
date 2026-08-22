import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

export type RouteHandler = (req: any, res: any, next: any) => unknown;

export type QueryMock = ReturnType<typeof vi.fn>;

export interface LoadedRouter {
  /** Handlers keyed by "METHOD path", e.g. "PUT /tasks/:id". */
  handlers: Map<string, RouteHandler>;
  /** Mocked pg pool query function shared by every handler in the module. */
  query: QueryMock;
}

/**
 * Loads an Express route module (CommonJS) with `express` and the database
 * service replaced by test doubles, so route handlers can be invoked directly
 * without starting a server or touching PostgreSQL.
 */
export function loadRouteModule(routeFileName: string, query: QueryMock): LoadedRouter {
  const routePath = require.resolve(`../../../apps/api/src/routes/${routeFileName}`);
  const handlers = new Map<string, RouteHandler>();

  const fakeRouter: Record<string, unknown> = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    fakeRouter[method] = (path: string, handler: RouteHandler) => {
      handlers.set(`${method.toUpperCase()} ${path}`, handler);
    };
  }

  Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === 'express') {
      return { Router: () => fakeRouter };
    }

    if (request === '../services/database') {
      return { getPool: () => ({ query }) };
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[routePath];
    require(routePath);
  } finally {
    Module._load = originalLoad;
  }

  return { handlers, query };
}

/** Returns a handler by "METHOD path", failing loudly when it is missing. */
export function getHandler(router: LoadedRouter, key: string): RouteHandler {
  const handler = router.handlers.get(key);
  if (!handler) {
    throw new Error(`Route handler not registered: ${key}`);
  }
  return handler;
}

/** Minimal Express response double capturing status code and JSON body. */
export function createResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
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
