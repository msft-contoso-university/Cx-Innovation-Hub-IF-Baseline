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

## Testing Express Route Handlers (Learned Pattern)

The API route files are CJS modules that use Express. Express is not installed in the unit test package. Use these techniques to test route handler logic without adding dependencies:

1. **Mock Express via `Module._load`**: intercept `request === 'express'` and return a `MockRouter` class that captures `stack: RouteEntry[]` entries with `{ method, path, handler }`.
2. **Inject the database mock via `require.cache`**: resolve the database module path once at the top of the test file, then before each test set `require.cache[databaseModulePath] = { id, filename, loaded: true, exports: { getPool: mockGetPool }, children: [], paths: [] }`. Delete both the database and route entries from `require.cache` in `afterEach`.
3. **Extract handlers by method + path** from `router.stack` and call them directly with plain mock `req`/`res`/`next` objects.
4. **Relative import depth**: test files under `concept/tests/unit/api/<folder>/` need `../../../../apps/api/src/...` (4 levels up to `concept/`) — verified pattern.

```typescript
// Minimal MockRouter (verified working pattern)
class MockRouter {
  stack: { method: string; path: string; handler: Function }[] = [];
  private _add(m: string, p: string, h: Function) { this.stack.push({ method: m, path: p, handler: h }); }
  get(p: string, h: Function) { this._add('GET', p, h); }
  post(p: string, h: Function) { this._add('POST', p, h); }
  put(p: string, h: Function) { this._add('PUT', p, h); }
  patch(p: string, h: Function) { this._add('PATCH', p, h); }
  delete(p: string, h: Function) { this._add('DELETE', p, h); }
}
// In Module._load: if (request === 'express') return { Router: () => new MockRouter() };
```
