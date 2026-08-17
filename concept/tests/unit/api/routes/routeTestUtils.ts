// =============================================================================
// Route Test Utilities
// =============================================================================
// Shared helper for unit testing Express route modules without a real HTTP
// server or an installed `express` package. Follows the repo's documented
// CommonJS module-loader interception pattern (see
// .github/skills/unit-testing-framework/SKILL.md) to intercept `require()`
// calls for `express` (replaced with a lightweight fake Router) and
// `../services/database` (replaced with a mock `getPool`), while leaving
// same-directory sibling modules (e.g. `../middleware/errorHandler`) to
// resolve normally since they have no external dependencies.
// =============================================================================

import { createRequire } from 'node:module';
import { vi } from 'vitest';

const requireFromHere = createRequire(import.meta.url);
const Module = requireFromHere('module');
const originalLoad = Module._load;

export type FakeRoute = {
  method: string;
  path: string;
  handler: (req: unknown, res: unknown, next: unknown) => unknown;
};

function createFakeRouter() {
  const routes: FakeRoute[] = [];
  const router: Record<string, unknown> = { __routes: routes };

  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (path: string, handler: FakeRoute['handler']) => {
      routes.push({ method, path, handler });
    };
  }

  return router;
}

export type MockPool = {
  query: ReturnType<typeof vi.fn>;
};

/**
 * Loads an Express route module (e.g. `routes/tasks.js`) with `express` and
 * `../services/database` intercepted. Returns the discovered routes plus the
 * mock pool so tests can control query results per-call.
 */
export function loadRouterModule(routeRelativePathFromHere: string) {
  const routeModulePath = requireFromHere.resolve(routeRelativePathFromHere);
  delete requireFromHere.cache[routeModulePath];

  const mockQuery = vi.fn();
  const mockPool: MockPool = { query: mockQuery };

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === 'express') {
      return { Router: createFakeRouter };
    }

    if (request === '../services/database') {
      return { getPool: () => mockPool };
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    const routerModule = requireFromHere(routeModulePath) as { __routes: FakeRoute[] };
    return { routes: routerModule.__routes, mockQuery };
  } finally {
    Module._load = originalLoad;
  }
}

/** Finds a registered route handler by HTTP method and path. Throws if missing. */
export function findRoute(routes: FakeRoute[], method: string, path: string): FakeRoute['handler'] {
  const found = routes.find((r) => r.method === method && r.path === path);
  if (!found) {
    throw new Error(`Route ${method.toUpperCase()} ${path} was not registered`);
  }
  return found.handler;
}

export type MockResponse = {
  statusCode: number;
  body: unknown;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

export function createMockResponse(): MockResponse {
  const res: Partial<MockResponse> = {
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
  return res as MockResponse;
}

/**
 * Invokes an async Express handler and waits for it to settle (either by
 * calling `res.json`/`res.status` or by calling `next(err)`).
 */
export async function invokeHandler(
  handler: FakeRoute['handler'],
  req: Record<string, unknown>,
  res: MockResponse,
): Promise<{ nextError: unknown }> {
  let nextError: unknown = undefined;
  let nextCalled = false;
  const next = vi.fn((err?: unknown) => {
    nextCalled = true;
    nextError = err;
  });

  await handler(req, res, next);

  return { nextError: nextCalled ? nextError : undefined };
}
