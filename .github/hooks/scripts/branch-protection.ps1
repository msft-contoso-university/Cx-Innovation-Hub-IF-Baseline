# =============================================================================
# Branch Protection Guardrail — Hook Script (PowerShell)
# =============================================================================
# Ensures all agent work stays on the demo/performance-testing branch.
#
# Pattern: exit 0 with permissionDecision "deny" in JSON to block.
# =============================================================================
param([string]$HookPhase)

$ALLOWED_BRANCH = "demo/performance-testing"

# Detect current branch
$CurrentBranch = git branch --show-current 2>$null
if (-not $CurrentBranch) { $CurrentBranch = "unknown" }

# ---------------------------------------------------------------------------
# SessionStart
# ---------------------------------------------------------------------------
if ($HookPhase -eq "session-start") {
    if ($CurrentBranch -ne $ALLOWED_BRANCH) {
        @{
            hookSpecificOutput = @{
                hookEventName    = "SessionStart"
                additionalContext = "WARNING: Current branch is '$CurrentBranch'. All work must be on '$ALLOWED_BRANCH'. Run: git checkout $ALLOWED_BRANCH"
            }
        } | ConvertTo-Json -Depth 5 | Write-Output
        exit 0
    }
    @{
        hookSpecificOutput = @{
            hookEventName    = "SessionStart"
            additionalContext = "Branch verified: $ALLOWED_BRANCH"
        }
    } | ConvertTo-Json -Depth 5 | Write-Output
    exit 0
}

# ---------------------------------------------------------------------------
# PreToolUse
# ---------------------------------------------------------------------------
if ($HookPhase -eq "pre-tool") {
    $inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json

    $toolName = $inputData.tool_name

    # Only inspect terminal tools
    if ($toolName -notin @("run_in_terminal", "execute_command", "run_command", "terminal", "bash", "shell")) {
        exit 0
    }

    $command = ""
    if ($inputData.tool_input.command) {
        $command = $inputData.tool_input.command
    } elseif ($inputData.tool_input.input) {
        $command = $inputData.tool_input.input
    }

    if (-not $command) { exit 0 }

    # Rule 1: Block branch creation
    if ($command -match 'git\s+(checkout\s+-b|switch\s+-c|branch\s+[^-])') {
        @{
            hookSpecificOutput = @{
                hookEventName            = "PreToolUse"
                permissionDecision       = "deny"
                permissionDecisionReason = "BLOCKED by branch protection: Branch creation is not allowed. All work must stay on '$ALLOWED_BRANCH'."
            }
        } | ConvertTo-Json -Depth 5 | Write-Output
        exit 0
    }

    # Rule 2: Block pushes to wrong branches
    if ($command -match 'git\s+push\s+\S+\s+(\S+)') {
        $pushTarget = $Matches[1]
        if ($pushTarget -and $pushTarget -ne $ALLOWED_BRANCH) {
            @{
                hookSpecificOutput = @{
                    hookEventName            = "PreToolUse"
                    permissionDecision       = "deny"
                    permissionDecisionReason = "BLOCKED by branch protection: Push to '$pushTarget' is not allowed. Only '$ALLOWED_BRANCH' is permitted."
                }
            } | ConvertTo-Json -Depth 5 | Write-Output
            exit 0
        }
    }

    # Rule 3: Block force pushes and history rewrites
    if ($command -match 'git\s+push.*--force') {
        @{
            hookSpecificOutput = @{
                hookEventName            = "PreToolUse"
                permissionDecision       = "deny"
                permissionDecisionReason = "BLOCKED by branch protection: Force pushes are prohibited."
            }
        } | ConvertTo-Json -Depth 5 | Write-Output
        exit 0
    }
    if ($command -match 'git\s+reset\s+--hard') {
        @{
            hookSpecificOutput = @{
                hookEventName            = "PreToolUse"
                permissionDecision       = "deny"
                permissionDecisionReason = "BLOCKED by branch protection: Hard resets are prohibited."
            }
        } | ConvertTo-Json -Depth 5 | Write-Output
        exit 0
    }
    if ($command -match 'git\s+rebase') {
        @{
            hookSpecificOutput = @{
                hookEventName            = "PreToolUse"
                permissionDecision       = "deny"
                permissionDecisionReason = "BLOCKED by branch protection: Rebase is prohibited. Use normal commits on '$ALLOWED_BRANCH'."
            }
        } | ConvertTo-Json -Depth 5 | Write-Output
        exit 0
    }

    # Rule 4: Verify branch before commit
    if ($command -match 'git\s+commit') {
        if ($CurrentBranch -ne $ALLOWED_BRANCH) {
            @{
                hookSpecificOutput = @{
                    hookEventName            = "PreToolUse"
                    permissionDecision       = "deny"
                    permissionDecisionReason = "BLOCKED by branch protection: Commit rejected. You are on '$CurrentBranch', not '$ALLOWED_BRANCH'."
                }
            } | ConvertTo-Json -Depth 5 | Write-Output
            exit 0
        }
    }

    # Allow everything else
    exit 0
}

exit 0
[Environment]::Exit(0)
