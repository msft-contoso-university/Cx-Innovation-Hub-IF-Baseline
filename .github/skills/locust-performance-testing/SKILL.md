---
name: locust-performance-testing
description: "Create Locust performance test scenarios for the Taskify API. Use when: adding a new performance test, creating a load test scenario, writing a Locust test, adding a perf test, performance testing, stress testing, load testing. Handles file creation, wiring into locustfile.py, and updating __init__.py exports."
---

# Locust Performance Testing — Scenario Creation

## When to Use

- User asks to add a new performance test or load test scenario
- User wants to test a new API endpoint under load
- User says "add a perf test for X" or "create a Locust scenario for Y"
- User wants to stress test or load test an endpoint

## Architecture Overview

Performance tests live in `concept/tests/performance/` with this structure:

```
concept/tests/performance/
├── locustfile.py              # Entry point — imports all scenarios
├── requirements.txt           # locust>=2.20.0
├── results/                   # CSV/HTML output (gitignored)
└── scenarios/
    ├── __init__.py            # Exports all User classes
    ├── base.py                # TaskifyBaseUser (abstract base class)
    ├── test_browse_projects.py
    ├── test_kanban_board.py
    ├── test_comments.py
    └── test_health.py
```

**Key design principles:**
- Each scenario is a separate `test_*.py` file in `scenarios/`
- The GitHub Actions pipeline **auto-discovers** `test_*.py` files — no YAML changes needed
- Each file must work both as a **package import** (via `locustfile.py`) and **standalone** (via `locust -f`)
- The dual-import pattern (`try: from .base` / `except: from base`) enables both modes

## Procedure

### Step 1: Create the scenario file

Create `concept/tests/performance/scenarios/test_{scenario_name}.py` following this template:

```python
"""
Scenario: {Human-Readable Name}

{One-line description of what this scenario simulates.}
Thresholds: GET p95 < 500 ms, POST/PATCH p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class {ClassName}User(TaskifyBaseUser):
    """{Brief description of this user type}."""

    weight = {1-10}  # Relative likelihood of this user type being spawned

    @task
    def {method_name}(self):
        """{What this task does}."""
        # Available from base class:
        #   self.projects  — list of project dicts (fetched on_start)
        #   self.users     — list of user dicts (fetched on_start)
        #   self.current_user_id — string ID of the simulated user
        #   self.client    — Locust HTTP client (requests-like)

        with self.client.get(
            "/api/endpoint",
            name="GET /api/endpoint",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"{method_name}: status {resp.status_code}")
                return
            # Enforce p95 threshold inline
            if resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"{method_name}: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
```

### Step 2: Register in `__init__.py`

Add the import and export to `concept/tests/performance/scenarios/__init__.py`:

```python
from .test_{scenario_name} import {ClassName}User
```

And add `"{ClassName}User"` to the `__all__` list.

### Step 3: Import in `locustfile.py`

Add the class to the import block in `concept/tests/performance/locustfile.py`:

```python
from scenarios import (
    BrowseProjectsUser,
    KanbanBoardUser,
    CommentActivityUser,
    HealthCheckUser,
    {ClassName}User,      # ← add here
)
```

Also update the docstring at the top of `locustfile.py` to list the new scenario.

### Step 4: Verify

Run these commands from `concept/tests/performance/`:

```bash
# Verify package import works
python -c "from scenarios import {ClassName}User; print('OK')"

# Verify standalone execution works
python -m locust -f scenarios/test_{scenario_name}.py --host=http://localhost:3000 --headless -u 5 -r 5 -t 15s

# Verify combined run still works
python -m locust -f locustfile.py --host=http://localhost:3000 --headless -u 10 -r 5 -t 30s
```

### Step 5: Run locally in Locust Web UI (default)

After creating the scenario, **always** launch Locust with its web UI so the user can observe the test live. The Locust web UI runs on `http://localhost:8089` by default.

**Procedure:**

1. **Kill any existing Locust process** on port 8089 to avoid conflicts:
   ```powershell
   Get-NetTCPConnection -LocalPort 8089 -ErrorAction SilentlyContinue | Select-Object OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
   ```

2. **Start Locust in the background** with `--autostart`, targeting only the new scenario file. The `--autostart` flag starts the test immediately while keeping the web UI available for live monitoring:
   ```bash
   cd concept/tests/performance
   python -m locust -f scenarios/test_{scenario_name}.py \
       --host={target_host} \
       -u {users} \
       --spawn-rate {spawn_rate} \
       -t {duration} \
       --autostart
   ```
   - `--host` — the target API URL (use cloud endpoint if provided, otherwise `http://localhost:3000`)
   - `-u` — number of virtual users
   - `--spawn-rate` — users spawned per second (compute from ramp-up: `users / ramp_up_seconds`, minimum 1)
   - `-t` — test duration (e.g., `900s`, `5m`)
   - `--autostart` — begins the test immediately; the web UI at `http://localhost:8089` remains available for live charts and stats
   - Do **NOT** pass `--headless` — we want the web UI available for monitoring

3. **Open the Locust UI in VS Code Simple Browser** using the VS Code command:
   ```
   simpleBrowser.show  →  http://localhost:8089
   ```
   Use the `run_vscode_command` tool (deferred — load via `tool_search_tool_regex` first):
   ```
   command: simpleBrowser.show
   args: ["http://localhost:8089"]
   ```
   This opens the Locust dashboard inside VS Code's integrated Simple Browser panel ([VS Code 1.112+ Simple Browser](https://code.visualstudio.com/updates/v1_112#_debug-web-apps-with-the-integrated-browser)).

4. The test is already running. The user can observe live charts, stats, and failures in the Locust web UI without needing to click Start.

**Spawn-rate calculation:** When a ramp-up period is specified (e.g., 180s for 100 users), calculate `spawn_rate = ceil(users / ramp_up_seconds)`. Example: 100 users / 180s ≈ 1 user/s.

## Rules

### Naming Conventions
- **File**: `test_{snake_case_name}.py` — the `test_` prefix is required for auto-discovery
- **Class**: `{PascalCaseName}User` — must end with `User` for Locust to discover it
- **Task method**: `snake_case` — descriptive of the user behavior

### Threshold Enforcement
- **GET requests**: p95 < 500ms — enforce with inline `resp.elapsed` check
- **POST/PATCH requests**: p95 < 1000ms
- **Overall error rate**: < 1% (enforced by pipeline, not per-scenario)

### Weight Guidelines
- `weight = 1` — infrequent/background (e.g., health checks)
- `weight = 2-3` — moderate traffic (e.g., reading data)
- `weight = 4-5` — heavy traffic (e.g., core user flows)

### Dual-Import Pattern (Required)
Every scenario MUST use:
```python
try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser
```
This allows the file to work as both a package import and a standalone Locust file.

### Base Class Provides
The `TaskifyBaseUser` in `scenarios/base.py` handles:
- `on_start()` — fetches all users and projects, sets random user ID
- `self.users` — list of user dicts from `/api/users`
- `self.projects` — list of project dicts from `/api/projects`
- `self.current_user_id` — string user ID for headers
- `wait_time = between(1, 3)` — random wait between tasks
- `host` — from `TASKIFY_BASE_URL` env var (default: `http://localhost:3000`)

**Important:** For cloud execution, the pipeline's 3-layer approach overrides `http://localhost:3000` with the real API URL (see Cloud Load Testing below). You do NOT need to change `base.py` for cloud tests.

### Pipeline Integration (Automatic)
The GitHub Actions workflow (`performance-testing.yml`) auto-discovers scenarios:
1. **discover-scenarios** job scans `scenarios/test_*.py` and builds a JSON matrix
2. **local-verification** runs all scenarios combined via `locustfile.py`
3. **local-scenario-tests** runs each scenario individually in parallel (matrix)
4. **cloud-load-test** runs each scenario as a separate Azure Load Test (matrix)

No workflow changes are needed when adding a new scenario.

### Configurable Load Parameters
The pipeline accepts these `workflow_dispatch` inputs to control load intensity:

| Input | Default | Used In | Description |
|-------|---------|---------|-------------|
| `combined_users` | `50` | local-verification | Virtual users for combined run |
| `combined_duration` | `3m` | local-verification | Duration (e.g., `2m`, `5m`, `10m`) |
| `combined_ramp_rate` | `10` | local-verification | Users spawned per second |
| `scenario_users` | `50` | local-scenario-tests + cloud-load-test | Virtual users per individual scenario |
| `scenario_duration` | `3m` | local-scenario-tests + cloud-load-test | Duration per scenario test |
| `scenario_ramp_rate` | `10` | local-scenario-tests + cloud-load-test | Users spawned per second per scenario |
| `run_cloud_tests` | `false` | cloud-load-test | Enable Azure Load Testing cloud runs |
| `target_url` | _(auto-detected)_ | cloud-load-test | Override API URL (auto-detects from Container App if blank) |

**To stress-test the system:** Increase `combined_users` to 200–500+ and `scenario_users` to 100+ via the "Run workflow" button. Increase duration to `5m` or `10m` for sustained load. These values are also available on push-triggered runs via their defaults.

### Cloud Load Testing (Azure Load Testing)
The **cloud-load-test** job runs each scenario as a separate Azure Load Test. It uses a **3-layer approach** to ensure the correct target host:

| Layer | Mechanism | Purpose |
|-------|-----------|--------|
| 1. `sed` patch | Replaces `http://localhost:3000` in `base.py` with the real API URL before upload | Bakes URL into Python source as fallback |
| 2. `locust.conf` | Generated with `host`, `users`, `spawn-rate`, `run-time` and uploaded as `USER_PROPERTIES` | Locust natively reads config files |
| 3. `--test-type Locust` + `--env LOCUST_HOST` | CLI flags on `az load test create` | Maps LOCUST_HOST to Azure Load tab's Host endpoint |

**Critical requirements for cloud tests:**
- `--test-type Locust` is **required** on `az load test create` — without it, Azure does not properly map Locust-specific env vars to the Load tab
- `--autostop disable` prevents premature test cancellation during ramp-up
- Duration must be an **integer in seconds** for `LOCUST_RUN_TIME` (Azure rejects Locust formats like `3m`). The pipeline converts automatically (e.g., `3m` → `180`)
- Supporting files (`base.py`, `__init__.py`) must be uploaded as `ADDITIONAL_ARTIFACTS`
- `locust.conf` must be uploaded as `USER_PROPERTIES` (not `ADDITIONAL_ARTIFACTS`)
- A **warm-up step** curls the API health/users/projects endpoints before creating load tests (Container Apps have `minReplicas: 0` and may be cold)

**Cloud test flow per scenario:**
1. Auto-detect API URL from Container App FQDN (or use `target_url` input)
2. Warm up the Container App with retried health checks
3. `sed`-patch `base.py` with the real URL
4. Generate `locust.conf` with host + load config
5. `az load test create` with `--test-type Locust`, env vars, autostop disabled
6. Upload `base.py` + `__init__.py` as `ADDITIONAL_ARTIFACTS`
7. Upload `locust.conf` as `USER_PROPERTIES`
8. `az load test-run create` to start the test
9. Poll for completion, download results
10. Parse Locust `_stats.csv` and display threshold table + error rate + summary in step summary (matching local run format)
11. Query App Insights for request telemetry and exceptions, display in step summary

### Cloud Result Reporting
After each cloud load test completes, the pipeline downloads results and produces a step summary that mirrors the local run format:

1. **Threshold Table**: Parses the Locust `_stats.csv` from downloaded results and displays:
   - Method | Endpoint | p95 (ms) | Threshold (ms) | Status (same GET < 500ms, POST/PATCH < 1000ms thresholds)
2. **Error Rate**: Extracts aggregated row from CSV, computes error percentage, checks < 1% threshold
3. **Summary**: Shows users, duration, total requests, failed requests
4. **Application Insights**: Displays server-side telemetry from App Insights:
   - Request summary: total requests, failed requests, avg/p95 duration, error rate
   - Exception details: type, message, count (top 20)

### Application Insights Integration
The API container is instrumented with the `applicationinsights` Node.js SDK. When the `APPLICATIONINSIGHTS_CONNECTION_STRING` environment variable is set (via Azure deployment), the SDK auto-collects:
- HTTP request telemetry (response times, status codes)
- Dependency calls (database queries, outbound HTTP)
- Exceptions and stack traces
- Performance counters (CPU, memory)

The pipeline's cloud-load-test job queries App Insights after each load test and displays the results in the GitHub Actions step summary alongside the Locust CSV results. This gives both client-side (Locust) and server-side (App Insights) perspectives on performance.

## Existing Scenarios Reference

| File | Class | Weight | Description |
|------|-------|--------|-------------|
| `test_browse_projects.py` | `BrowseProjectsUser` | 3 | Browse project list, view project details |
| `test_kanban_board.py` | `KanbanBoardUser` | 4 | Load task board, drag-drop status change |
| `test_comments.py` | `CommentActivityUser` | 2 | View task comments, post new comment |
| `test_health.py` | `HealthCheckUser` | 1 | Lightweight health endpoint probe |
| `test_users.py` | `UserDirectoryUser` | 3 | Browse user directory and view user profiles |

## API Endpoints Available

From the Taskify Express.js API:
- `GET /api/health` — health check
- `GET /api/users` — list all users
- `GET /api/projects` — list all projects
- `GET /api/projects/:id` — project details
- `GET /api/projects/:id/tasks` — tasks for a project
- `PATCH /api/tasks/:id/status` — update task status (body: `{status, position}`)
- `GET /api/tasks/:taskId/comments` — list comments on a task
- `POST /api/tasks/:taskId/comments` — create a comment (body: `{content, user_id}`)
