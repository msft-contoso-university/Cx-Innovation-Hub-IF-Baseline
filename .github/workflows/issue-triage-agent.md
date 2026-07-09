---
emoji: 🧭
description: "Triages newly opened issues by labeling type/priority, detecting duplicates, requesting clarifications, and assigning ownership."
on:
  issues:
    types: [opened]
permissions:
  contents: read
  issues: read
roles: all
tools:
  github:
    mode: gh-proxy
    toolsets: [default, issues]
safe-outputs:
  add-labels:
    allowed:
      - type:bug
      - type:feature
      - type:question
      - type:task
      - priority:p0
      - priority:p1
      - priority:p2
      - priority:p3
      - status:needs-info
      - status:duplicate
      - status:triaged
    max: 4
  add-comment:
    max: 2
    issues: true
    pull-requests: false
  close-issue:
    target: triggering
    state-reason: duplicate
    max: 1
  assign-to-user:
    allowed: [TeplrGuy]
    target: triggering
    max: 1
---

# Issue Triage Agent

## Task

Triage each newly opened issue and apply exactly one type label and one priority label.

### 1) Understand the issue

- Read the issue title and body.
- Determine the most likely type:
  - `type:bug` for broken behavior
  - `type:feature` for new capability requests
  - `type:question` for help/clarification requests
  - `type:task` for maintenance/chore/work item requests

### 2) Set priority

Choose one priority label:

- `priority:p0` critical outage, security risk, or production blocker
- `priority:p1` high impact or major user-facing degradation
- `priority:p2` normal priority default
- `priority:p3` low urgency / nice-to-have

### 3) Detect duplicates

- Search existing open and recently closed issues for highly similar reports.
- If this issue is a duplicate:
  - Add `status:duplicate`
  - Add a brief comment linking the original issue and explaining why it is a duplicate
  - Close this issue as duplicate using the duplicate target
  - Do not assign a new owner

### 4) Request clarification when unclear

- If the description lacks key details (repro steps, expected vs actual behavior, scope, environment, or acceptance criteria), add `status:needs-info` and post a focused clarification comment with specific questions.
- Keep the issue open.

### 5) Assign ownership

- If not duplicate, assign the issue to `TeplrGuy`.
- Add `status:triaged` after successful triage.

## Safe Outputs

- Use only configured safe outputs for labels, comments, duplicate closure, and assignment.
- Use `noop` with a short explanation when no visible change is required.
