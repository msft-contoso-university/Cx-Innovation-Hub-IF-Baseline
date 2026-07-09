---
emoji: 🧭
description: "Triages newly opened issues by labeling type/priority, detecting duplicates, requesting clarifications, and assigning ownership."
on:
  issues:
    types: [opened]
  roles: all
permissions:
  contents: read
  issues: read
tools:
  github:
    mode: gh-proxy
    toolsets: [issues]
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
      - ai-ready
      - needs-human-review
    max: 5
  add-comment:
    max: 3
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

### 5) Assess AI readiness

After determining type and priority, evaluate if the issue is actionable by AI agents:

**Add `ai-ready` label when ALL of these criteria are met:**
- Clear, specific requirements or bug description
- Sufficient technical context (files, endpoints, components mentioned)
- Acceptance criteria are explicit or easily inferred
- Scope is well-bounded (not vague like "improve performance" without specifics)
- For bugs: reproduction steps are clear
- For features: expected behavior is well-defined

**Add `needs-human-review` label when:**
- Requirements are vague or open-ended
- Needs architectural decisions
- Requires domain knowledge or business context
- Security or compliance considerations
- Multiple valid implementation approaches exist

### 6) Add helpful AI guidance comment

If you add `ai-ready`, post a structured comment that:
- Signals this is ready for automated work
- Provides context for AI agents (Copilot/Claude)
- Includes specific technical details

Example format:
```
🤖 **AI-Ready Issue**

This issue has sufficient detail for automated implementation.

**Scope:** Add validation for email field in user registration
**Files:** `src/routes/users.js`
**Requirements:** 
- Email format validation using standard regex
- Return 400 with clear error message if invalid
- Add unit tests following repository conventions

**Approach:** Use existing validation middleware pattern from other routes.

---
@{assignee} This issue is ready for automated processing. The AI Implementation Agent will automatically begin work once this label is applied.
```

If you add `needs-human-review`, post a comment explaining why:
```
⚠️ **Human Review Required**

This issue needs human judgment before implementation:
- [Reason: architectural decision needed / security implications / unclear scope / etc.]

@{assignee} Please review and provide additional guidance or break this down into more specific tasks.
```

### 7) Assign ownership

**For all issues (regardless of readiness):**
- Assign to TeplrGuy for visibility and oversight
- Assignment doesn't block automated work for `ai-ready` issues

**For `ai-ready` issues:**
- The `ai-ready` label automatically triggers the **AI Implementation Agent** workflow
- AI agent reads the guidance comment, implements changes, runs tests, and creates a PR
- Human reviews and merges the AI-generated PR

**For `needs-human-review` issues:**
- Human makes decisions on architecture, approach, or scope
- May refine requirements and re-label as `ai-ready` for automation

**For `status:needs-info` issues:**
- Human monitors for user response
- Re-triage when information is provided

Always add `status:triaged` after successful triage.

## Safe Outputs

- Use only configured safe outputs for labels, comments, duplicate closure, and assignment.
- Labels available: type labels, priority labels, status labels, `ai-ready`, `needs-human-review`
- Maximum 5 labels per issue (typically: 1 type + 1 priority + 1 status + optional AI readiness labels)
- Maximum 3 comments (duplicate notice, clarification request, AI guidance)
- Use `noop` with a short explanation when no visible change is required.

## AI Readiness Examples

**Good candidates for `ai-ready`:**
- "Add DELETE endpoint for /api/tasks/:id with authorization check"
- "Fix bug: pagination breaks on page 10+ due to offset calculation"
- "Add email validation to user registration form with proper error messages"
- "Refactor authentication middleware to use async/await"

**Needs human review:**
- "Improve application performance" (too vague, needs specific metrics/areas)
- "Redesign the dashboard" (architectural decision needed, UX input required)
- "Add AI features to the app" (scope unclear, multiple approaches possible)
- "Migrate to new database" (requires careful planning and data migration strategy)

## Workflow Integration

This triage agent is part of an automated issue-to-PR pipeline:

### 1. **Triage** (this workflow)
- New issue opened → Auto-labeled with type + priority
- Assessed for AI readiness
- If `ai-ready`: Posts structured guidance comment + assigns owner
- If `needs-human-review`: Requests human intervention

### 2. **Automated Implementation** (AI Implementation Agent workflow)
- Triggers when `ai-ready` label is added
- Reads the AI guidance comment
- Implements the changes following repository conventions
- Runs tests to verify correctness
- Creates PR automatically with detailed description

### 3. **Human Review**
- Assigned person reviews the AI-generated PR
- Merges if acceptable or requests changes
- Closes the original issue automatically via PR

**Query for issues by status:**
- Ready for AI: `is:issue is:open label:ai-ready`
- Needs human: `is:issue is:open label:needs-human-review`
- Needs info: `is:issue is:open label:status:needs-info`

**Result:** Well-specified issues go from triage → implementation → PR in minutes, freeing humans to focus on complex problems that need judgment.
