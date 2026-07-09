---
description: Reviews recent changes and adds missing tests where coverage is thin
on: daily
tools:
  github:
    toolsets:
      - pull_requests
permissions:
  pull-requests: read
safe-outputs:
  create-pull-request:
    max: 1
  add-comment:
    max: 2
    issues: false
    pull-requests: true
# Unsupported fields preserved from source JSON:
# model: auto
---

# Add test coverage

On each pass, review recently merged changes and add missing tests where risk is meaningful and coverage is thin.

## Repository guardrails you must follow

- Follow the repository testing guidance in .github/copilot-instructions.md.
- Use repository skills under .github/skills:
  - Unit tests: .github/skills/unit-testing-framework/SKILL.md
  - Performance tests: .github/skills/locust-performance-testing/SKILL.md
  - E2E tests: .github/skills/playwright-cli-testing/SKILL.md
- Enforce hook rules under .github/hooks:
  - Branch protection policy: .github/hooks/branch-protection.json and .github/hooks/scripts/branch-protection.ps1
  - Load-test coverage policy: .github/hooks/load-test-coverage.json and .github/hooks/scripts/load-test-coverage.ps1
- Do all work on branch demo/performance-testing.
- Do not create new branches.
- Do not rebase.
- Do not force-push.
- Do not hard reset.
- Keep tests deterministic, isolated, and reproducible.
- Avoid flaky timing assumptions, uncontrolled randomness, and shared mutable state between tests.

## What to focus on

Give priority to:
- Newly introduced code paths with no tests.
- Bug fixes where only production code changed.
- Boundary conditions, parsing, concurrency, authorization, and input validation.
- Common helpers and critical pathways with broad blast radius on failure.
- Any API endpoints identified as missing by the load-test coverage hook logic.

Skip:
- Low-value snapshot assertions that provide little signal.
- Coverage for purely visual or stylistic-only changes.
- Behavior-preserving refactors, unless critical behavior is still unverified.

## Required test placement and conventions

- Unit tests:
  - Framework: Vitest.
  - Location: concept/tests/unit.
  - Naming: pattern ends with .spec.ts.
  - Run from concept/tests/unit with npm test.
- E2E tests:
  - Location: concept/tests/e2e/tests.
  - Use shared config: concept/tests/e2e/playwright.config.ts.
  - Prefer stable selectors and deterministic flows.
- Performance tests:
  - Location: concept/tests/performance/scenarios.
  - Naming: pattern starts with test_ and ends with .py.
  - Reuse base class and dual-import pattern from concept/tests/performance/scenarios/base.py.
  - Register new scenario classes in concept/tests/performance/scenarios/__init__.py.
  - Import new scenario classes in concept/tests/performance/locustfile.py.
  - Treat missing endpoints from the hook as concrete tasks until threshold is satisfied.

## How to write tests

- Match established project style and fixture conventions in concept/tests.
- Use focused tests with clear Arrange, Act, Assert structure.
- Add the minimum set of high-signal tests needed to prove behavior.
- Do not modify production code unless a very small refactor is required for testability.
- For tests requiring local runtime, start from concept/docker-compose.yml and verify health endpoints first.

## Verification before submitting

- Run only the suites relevant to touched areas first, then any required broader checks.
- Confirm no introduced flakiness, race sensitivity, or environment-coupled brittleness.
- If performance coverage is involved, ensure hook-based endpoint coverage expectations are met.

## Pull request reporting requirements

When opening a PR, document:
- Which risky behaviors are now covered.
- Which test files were added or changed.
- Which skills were used and how repo conventions were enforced.
- What commands and suites were run and results.
- Any known limitations, flakiness risks, or follow-up test gaps.
```
