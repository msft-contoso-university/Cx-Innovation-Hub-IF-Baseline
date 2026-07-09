#!/usr/bin/env bash
# =============================================================================
# Load Test Coverage Check — SessionStart Hook Script (Bash)
# =============================================================================
# Calculates Locust performance test coverage against API endpoints.
# If coverage is below the threshold, shows a warning to the developer.
#
# Pattern: exit 0 with JSON stdout. Uses systemMessage for visible warnings.
# =============================================================================
set -u

THRESHOLD=90
API_DIR="concept/apps/api/src"
TEST_DIR="concept/tests/performance/scenarios"
INDEX_FILE="$API_DIR/index.js"

# Read and discard stdin (hook sends common fields we don't need)
cat > /dev/null 2>&1 || true

[[ ! -f "$INDEX_FILE" ]] && exit 0

EP_FILE=$(mktemp)
TESTED_FILE=$(mktemp)
trap 'rm -f "$EP_FILE" "$TESTED_FILE"' EXIT

# ---------------------------------------------------------------------------
# Step 1: Discover API endpoints
# ---------------------------------------------------------------------------

# Inline routes from index.js (e.g., app.get("/api/health", ...))
grep -oE 'app\.(get|post|put|patch|delete)\("([^"]+)"' "$INDEX_FILE" 2>/dev/null | while IFS= read -r match; do
    method=$(echo "$match" | sed -E 's/app\.([a-z]+)\(.*/\1/' | tr '[:lower:]' '[:upper:]')
    path=$(echo "$match" | sed -E 's/.*"([^"]+)".*/\1/')
    echo "$method $path"
done >> "$EP_FILE"

# Route file endpoints — for each app.use() mount
grep -E 'app\.use\("[^"]+"[[:space:]]*,[[:space:]]*[a-zA-Z]' "$INDEX_FILE" 2>/dev/null | while IFS= read -r line; do
    mount=$(echo "$line" | sed -E 's/.*app\.use\("([^"]+)".*/\1/')
    varname=$(echo "$line" | sed -E 's/.*,[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*)\).*/\1/')

    # Find the require line for this variable to get the filename
    filename=$(grep -E "const[[:space:]]+${varname}[[:space:]]*=" "$INDEX_FILE" | sed -E 's/.*require\("\.\/routes\/([^"]+)"\).*/\1/')
    [[ -z "$filename" ]] && continue

    # Add .js extension if not present
    case "$filename" in
        *.js) ;;
        *) filename="${filename}.js" ;;
    esac

    routefile="$API_DIR/routes/$filename"
    [[ ! -f "$routefile" ]] && continue

    grep -oE 'router\.(get|post|put|patch|delete)\("([^"]+)"' "$routefile" 2>/dev/null | while IFS= read -r rmatch; do
        rmethod=$(echo "$rmatch" | sed -E 's/router\.([a-z]+)\(.*/\1/' | tr '[:lower:]' '[:upper:]')
        subpath=$(echo "$rmatch" | sed -E 's/.*"([^"]+)".*/\1/')
        if [[ "$subpath" == "/" ]]; then
            echo "$rmethod $mount"
        else
            echo "$rmethod ${mount}${subpath}"
        fi
    done >> "$EP_FILE"
done

# ---------------------------------------------------------------------------
# Step 2: Discover tested endpoints from Locust test files
# ---------------------------------------------------------------------------
for tf in "$TEST_DIR"/test_*.py; do
    [[ ! -f "$tf" ]] && continue
    grep -oE 'name[[:space:]]*=[[:space:]]*"[^"]*"' "$tf" 2>/dev/null | while IFS= read -r nmatch; do
        # Strip name=" prefix, optional [tag], and trailing "
        cleaned=$(echo "$nmatch" | sed -E 's/name[[:space:]]*=[[:space:]]*"//' | sed -E 's/"$//' | sed -E 's/^\[[^]]*\][[:space:]]*//')
        method=$(echo "$cleaned" | grep -oE '^(GET|POST|PUT|PATCH|DELETE)')
        path=$(echo "$cleaned" | sed -E 's/^[A-Z]+[[:space:]]+//')
        [[ -n "$method" && -n "$path" ]] && echo "$method $path"
    done >> "$TESTED_FILE"
done

# ---------------------------------------------------------------------------
# Step 3: Normalize and compare
# ---------------------------------------------------------------------------
NORM_ALL=$(sed -E 's/:[a-zA-Z_]+/:param/g' "$EP_FILE" 2>/dev/null | sort -u)
NORM_TESTED=$(sed -E 's/:[a-zA-Z_]+/:param/g' "$TESTED_FILE" 2>/dev/null | sort -u)

if [[ -z "$NORM_ALL" ]]; then
    exit 0
fi

TOTAL=$(echo "$NORM_ALL" | wc -l | tr -d ' ')
[[ "$TOTAL" -eq 0 ]] && exit 0

COMMON=$(comm -12 <(echo "$NORM_ALL") <(echo "$NORM_TESTED") 2>/dev/null)
if [[ -z "$COMMON" ]]; then
    COVERED=0
else
    COVERED=$(echo "$COMMON" | wc -l | tr -d ' ')
fi

COVERAGE=$((COVERED * 100 / TOTAL))

# ---------------------------------------------------------------------------
# Step 4: Output JSON result
# ---------------------------------------------------------------------------
if [[ "$COVERAGE" -ge "$THRESHOLD" ]]; then
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"Load test coverage: ${COVERED}/${TOTAL} endpoints (${COVERAGE}%) - meets ${THRESHOLD}% threshold.\"}}"
    exit 0
fi

# Below threshold — build missing endpoint list
MISSING=$(comm -23 <(echo "$NORM_ALL") <(echo "$NORM_TESTED") 2>/dev/null)
MISSING_STR=""
while IFS= read -r ep; do
    [[ -z "$ep" ]] && continue
    # Look up original (non-normalized) name from endpoints file
    pattern=$(echo "$ep" | sed -E 's/:param/:[a-zA-Z_]+/g')
    orig=$(grep -m1 -E "^${pattern}$" "$EP_FILE" 2>/dev/null || echo "$ep")
    MISSING_STR="${MISSING_STR}  - ${orig}\\n"
done <<< "$MISSING"

# Output JSON with systemMessage (visible to user) and additionalContext (for model)
cat <<ENDJSON
{"systemMessage":"LOAD TEST COVERAGE: ${COVERAGE}% (${COVERED}/${TOTAL} endpoints) - below ${THRESHOLD}% threshold.\\n\\nMissing load tests for:\\n${MISSING_STR}\\nRun /locust-performance-testing to add the missing test scenarios.","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Load test coverage is ${COVERAGE}% (${COVERED}/${TOTAL} API endpoints covered). Threshold: ${THRESHOLD}%. Missing endpoints:\\n${MISSING_STR}The locust-performance-testing skill (/locust-performance-testing) can create new Locust test scenarios. Test files go in concept/tests/performance/scenarios/test_*.py. Remind the developer about the missing coverage and offer to help create the missing test scenarios."}}
ENDJSON
exit 0
