#!/usr/bin/env bash
# =============================================================================
# Branch Protection Guardrail — Hook Script
# =============================================================================
# Ensures all agent work stays on the demo/performance-testing branch.
#
# Lifecycle events handled:
#   SessionStart — validates current branch on session init
#   PreToolUse   — blocks git commands that create branches, push to wrong
#                  branches, or rewrite history
#
# Input:  JSON via stdin (VS Code Copilot hooks protocol)
# Output: JSON via stdout
# Exit:   0 = pass, 2 = block
# =============================================================================
set -euo pipefail

ALLOWED_BRANCH="demo/performance-testing"
HOOK_PHASE="${1:-}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
block() {
  local reason="$1"
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "${reason}"
  }
}
EOF
  exit 0
}

pass() {
  echo '{}'
  exit 0
}

# ---------------------------------------------------------------------------
# Detect current branch
# ---------------------------------------------------------------------------
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# ---------------------------------------------------------------------------
# SessionStart — verify branch once at session init
# ---------------------------------------------------------------------------
if [ "$HOOK_PHASE" = "session-start" ]; then
  if [ "$CURRENT_BRANCH" != "$ALLOWED_BRANCH" ]; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "WARNING: Current branch is '${CURRENT_BRANCH}'. All work must be on '${ALLOWED_BRANCH}'. Run: git checkout ${ALLOWED_BRANCH}"
  }
}
EOF
    exit 0
  fi

  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Branch verified: ${ALLOWED_BRANCH}"
  }
}
EOF
  exit 0
fi

# ---------------------------------------------------------------------------
# PreToolUse — read stdin only here (avoids blocking pipe for other events)
# ---------------------------------------------------------------------------
if [ "$HOOK_PHASE" = "pre-tool" ]; then

  INPUT=$(cat)

  # Parse tool_name — VS Code Copilot uses "run_in_terminal" for terminal commands
  TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"//' || echo "")

  if [ "$TOOL_NAME" != "run_in_terminal" ]; then
    pass
  fi

  # Extract the command string from tool_input
  COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || \
            echo "$INPUT" | grep -oP '"command"\s*:\s*"\K[^"]*' || echo "")

  if [ -z "$COMMAND" ]; then
    pass
  fi

  # --- Rule 1: Block branch creation ---
  if echo "$COMMAND" | grep -qE 'git\s+(checkout\s+-b|switch\s+-c|branch\s+[^-])'; then
    block "Branch creation is not allowed. All work must stay on '${ALLOWED_BRANCH}'."
  fi

  # --- Rule 2: Block pushes to wrong branches ---
  if echo "$COMMAND" | grep -qE 'git\s+push\s+\S+\s+\S+'; then
    PUSH_TARGET=$(echo "$COMMAND" | grep -oE 'git\s+push\s+\S+\s+(\S+)' | awk '{print $NF}' || echo "")
    if [ -n "$PUSH_TARGET" ] && [ "$PUSH_TARGET" != "$ALLOWED_BRANCH" ]; then
      block "Push to '${PUSH_TARGET}' is not allowed. Only '${ALLOWED_BRANCH}' is permitted."
    fi
  fi

  # --- Rule 3: Block force pushes and history rewrites ---
  if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force'; then
    block "Force pushes are prohibited."
  fi
  if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force-with-lease'; then
    block "Force pushes (--force-with-lease) are prohibited."
  fi
  if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
    block "Hard resets are prohibited. They rewrite history."
  fi
  if echo "$COMMAND" | grep -qE 'git\s+rebase'; then
    block "Rebase is prohibited. Use normal commits on '${ALLOWED_BRANCH}'."
  fi

  # --- Rule 4: Verify current branch before any git commit ---
  if echo "$COMMAND" | grep -qE 'git\s+commit'; then
    if [ "$CURRENT_BRANCH" != "$ALLOWED_BRANCH" ]; then
      block "Commit rejected. You are on '${CURRENT_BRANCH}', not '${ALLOWED_BRANCH}'."
    fi
  fi

  pass
fi

# Default: pass through
pass
