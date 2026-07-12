---
emoji: 📚
description: "Runs daily to detect documentation drift from recent code changes and opens a PR with doc updates."
on: daily # Compiles to a scattered daily cron in the lock workflow
permissions:
  contents: read
  pull-requests: read
tools:
  github:
    mode: gh-proxy
    toolsets: [repos, pull_requests]
safe-outputs:
  create-pull-request:
    max: 1
    allowed-files:
      - "**/*.md"
---

# Documentation Sync Agent

## Task

On each run, keep repository documentation aligned with recent code changes.

### 1) Review recent code activity

- Inspect merged pull requests and commits on the default branch since the previous successful run (fallback: last 24 hours when prior run context is unavailable).
- Focus on changes to source code, APIs, scripts, workflows, tests, configuration, and infrastructure files.

### 2) Identify documentation drift

- Determine which documentation files are likely affected by those code changes.
- Check, at minimum, repository docs such as `README.md`, files under `docs/`, and other markdown docs in the repo.
- Prioritize factual accuracy: commands, paths, endpoints, behavior, architecture notes, setup steps, and automation descriptions.

### 3) Update docs only when needed

- Make concise, accurate documentation edits that reflect current behavior.
- Keep edits limited to markdown documentation files.
- Do not change production code, tests, lock files, or generated artifacts.

### 4) Open a pull request when updates are required

If documentation updates are needed, create exactly one PR with:

- A clear title in the format: `docs: sync docs with recent code changes`
- A summary of what changed and why
- A short list of the code changes that triggered the documentation updates

### 5) No-op behavior

- If no documentation drift is detected, call `noop` with a short explanation that includes the time window checked, how many commits/PRs were reviewed, and which doc files or doc areas were evaluated.

## Safe Outputs

- Use only the configured `create-pull-request` safe output.
- Create at most one PR per run.
- Use `noop` when no visible change is needed.
