---
emoji: 📊
description: "Delivers a daily report on repository activity as a GitHub issue, summarizing new issues, merged pull requests, and open blockers."
on:
  schedule: "0 7 * * *"
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

tools:
  github:
    mode: gh-proxy
    toolsets: [issues, repos]

safe-outputs:
  mentions: false
  allowed-github-references: []
  max-bot-mentions: 1
  create-issue:
    title-prefix: "Daily Activity Report:"
    labels: [report]
    close-older-issues: true
    expires: 14
---

# Daily Activity Report

## Task

Generate a concise daily activity report for the repository covering the **last 24 full hours ending at workflow start (UTC)**.

### 1) Gather data

Use `gh` commands to collect:

- **New issues**: Issues opened in the last 24 hours.
  ```
  gh issue list --state open --json number,title,labels,createdAt,author --limit 100
  ```
  Filter to those with `createdAt` within the last 24 hours.

- **Merged pull requests**: PRs merged in the last 24 hours.
  ```
  gh pr list --state merged --json number,title,mergedAt,author,labels --limit 100
  ```
  Filter to those with `mergedAt` within the last 24 hours.

- **Open blockers**: Any open issues or PRs labeled `priority:p0`, `priority:p1`, `blocker`, or `status:blocked`.
  ```
  gh issue list --state open --label "priority:p0" --json number,title,labels,createdAt,assignees --limit 50
  gh issue list --state open --label "priority:p1" --json number,title,labels,createdAt,assignees --limit 50
  ```

### 2) Build the report

Compose the issue body using GitHub-flavored markdown. Follow this structure:

```
### Summary

Brief 1–2 sentence overview of activity in the last 24 hours.

### New Issues (<count>)

| # | Title | Author | Labels |
|---|-------|--------|--------|
| ... | ... | ... | ... |

> [!NOTE]
> No new issues opened in the last 24 hours.
(Use the NOTE callout only when count is zero.)

### Merged Pull Requests (<count>)

| # | Title | Author |
|---|-------|--------|
| ... | ... | ... |

> [!NOTE]
> No pull requests merged in the last 24 hours.
(Use the NOTE callout only when count is zero.)

### Open Blockers (<count>)

| # | Title | Labels | Assignees |
|---|-------|--------|-----------|
| ... | ... | ... | ... |

> [!CAUTION]
> <count> open blocker(s) require attention.
(Use the CAUTION callout only when blockers exist.)

> [!NOTE]
> No open blockers.
(Use the NOTE callout only when there are none.)

### Context

- Report window: <window_start_utc> to <window_end_utc>
- Workflow run: [§<run_id>](https://github.com/<owner>/<repo>/actions/runs/<run_id>)
```

Start all nested headings at `###`. Do not use `#` or `##`.

### 3) Post or skip

- If there were zero new issues, zero merged PRs, and zero open blockers, call `noop("No activity in the last 24 hours (<window_start_utc> to <window_end_utc>)")`.
- Otherwise, use `create-issue` with a descriptive title that includes today's UTC date, for example: `Daily Activity Report: 2026-07-09`.

## Safe Outputs

- Use `create-issue` to post the report. Previous daily report issues are closed automatically.
- Use `noop` with the evaluated window timestamps when there is nothing to report.
