---
name: unit-testing-framework
description: "Create and update unit tests for this repository using Vitest. Use when: unit test, vitest, test coverage, add tests, update tests, refactor-safe tests. Enforces test placement under concept/tests/unit and repo naming conventions."
---

# Unit Testing Framework (Vitest, Repo-Specific)

## When to Use

- User asks to add or update **unit tests**
- User asks for **Vitest** tests
- User asks for test coverage for API/web utility logic
- User asks an agent to "create a test"

## Required Test Location (Do Not Deviate)

All unit tests in this repository must be created under:

`concept/tests/unit/`

Do **not** place unit tests in app folders.

## Naming Conventions

- Test file pattern: `*.spec.ts`
- Existing baseline example: `concept/tests/unit/helloWorld.spec.ts`
- Keep names behavior-focused, e.g.:
  - `calculateTotals.spec.ts`
  - `formatProjectName.spec.ts`

## Framework and Runtime

- Framework: **Vitest**
- Config: `concept/tests/unit/vitest.config.ts`
- Environment: `node`
- Globals enabled (`describe`, `it`, `expect`)
- Include pattern: `**/*.spec.ts`

## Source-to-Test Placement Rule

When testing code from elsewhere in the repo (for example under `apps/api/src` or `apps/web/src`), still place the test file in `concept/tests/unit/`.

Use one of these patterns:

1. Single-module test (default):
   - `concept/tests/unit/<moduleName>.spec.ts`

2. Mirrored subfolder test (preferred when many files are related):
   - `concept/tests/unit/api/<feature>/<moduleName>.spec.ts`
   - `concept/tests/unit/web/<feature>/<moduleName>.spec.ts`

Keep imports explicit and relative to the tested source file.

## Test Authoring Standard

Use AAA pattern in each test:

1. Arrange
2. Act
3. Assert

Cover at least:

- happy path
- one edge case
- one failure/invalid-input case (when applicable)

## Minimal Test Template (Vitest)

```typescript
import { describe, it, expect } from 'vitest';

describe('module under test', () => {
  it('does expected behavior', () => {
    // Arrange

    // Act

    // Assert
    expect(true).toBe(true);
  });
});
```

## Reference Guides

Detailed implementations in the `references/` directory:

| Guide | Contents |
|---|---|
| [Test Structure (AAA Pattern)](references/test-structure-aaa-pattern.md) | Arrange-Act-Assert pattern with Vitest |
| [Test Cases by Language](references/test-cases-by-language.md) | Vitest-first TypeScript examples for this repo |
| [Mocking & Test Doubles](references/mocking-test-doubles.md) | `vi.fn`, `vi.mock`, and `vi.spyOn` patterns |
| [Testing Async Code](references/testing-async-code.md) | Async assertions and coverage workflow |
| [Testing Edge Cases](references/testing-edge-cases.md) | Input boundaries and failure-path checks |
| [Example: Complete Test Suite](references/example-complete-test-suite.md) | End-to-end unit test file pattern with Vitest |

## Commands

From `concept/tests/unit`:

```bash
npm test
```

Optional:

```bash
npm run test:watch
npm run test:ui
```

## Guardrails

- Do not switch framework to Jest/Mocha.
- Do not create `.test.ts` if `.spec.ts` is requested by config.
- Do not put unit tests under `tests/unit` (old path) or app directories.
- Keep tests deterministic and independent (no network/database calls).

## Reliability Updates (Mandatory)

- If a generated test fails because the skill guidance was incomplete or incorrect, update this skill in the same change with the verified fix pattern.
- Prefer adding concise, reusable guidance over one-off notes so subsequent tests do not regress.

## CommonJS Mocking Pitfall (Learned Pattern)

- Some API modules in this repo are CommonJS (`require`) and instantiate dependencies with `new`.
- For these modules, `vi.mock` alone can miss interception depending on loader path and timing.
- Use a module-loader interception pattern for deterministic mocking:
  - Resolve the target module path with `createRequire(...).resolve(...)`.
  - Temporarily patch `Module._load` to return test doubles for external packages (`pg`, Azure SDK clients, etc.).
  - Clear the module from `require.cache` before loading it per test.
  - Restore `Module._load` in `afterEach`.
- When mocking constructor dependencies called with `new`, use function/class-style `vi.fn().mockImplementation(function ... )` implementations, not arrow functions.

## Express Route Testing (Learned Pattern)

The API's `node_modules` are not installed in the test environment. When testing Express route modules:

- `express` is not resolvable via `originalLoad` — intercept it with a lightweight mock Router.
- For `../middleware/errorHandler`, load it once via `require.resolve` (it has no external deps) and re-serve it in `Module._load` to avoid resolution errors.
- Use `Module._resolveFilename(request, parent, isMain)` inside the `Module._load` interceptor to canonicalize relative paths before comparing them to pre-resolved absolute paths.
- Lightweight Router mock that matches the `router.stack` format used by the `getHandler` helper:

```typescript
function createMockRouter() {
  const stack: any[] = [];
  const router: any = { stack };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (routePath: string, handler: Function) => {
      stack.push({
        route: {
          path: routePath,
          methods: { [method]: true },
          stack: [{ handle: handler }],
        },
      });
    };
  }
  return router;
}
const expressMock = { Router: createMockRouter };
```

- Route handlers are extracted with a helper:

```typescript
function getHandler(router: any, method: string, routePath: string): Function {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === routePath && l.route.methods[method.toLowerCase()],
  );
  if (!layer) throw new Error(`No ${method} ${routePath} route found`);
  return layer.route.stack[0].handle;
}
```

- Call extracted handlers with plain mock `req`/`res`/`next` objects:

```typescript
function buildRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json }, status, json };
}
```
