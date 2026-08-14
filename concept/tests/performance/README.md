# Taskify Performance Tests

Locust-based performance tests for the Taskify Kanban Board REST API. These tests simulate realistic user behavior — browsing projects, dragging tasks across Kanban columns, and posting comments — to validate response times and throughput under load.

## What Is Tested

| Scenario | Weight | Description |
|---|---|---|
| **Browse Projects** | 3 | Lists all projects, then fetches a random project's details |
| **Kanban Board Flow** | 4 | Loads a project's tasks, then moves a random task to the next status column (simulates drag-drop) |
| **Comment Activity** | 2 | Fetches comments on a task, then posts a new comment |
| **Health Check** | 1 | Hits the `/api/health` endpoint |
| **User Directory** | 3 | Lists users, then fetches a random user profile |
| **Task Lifecycle** | 3 | Creates a task, edits it, assigns a user, then deletes it |
| **Comment Moderation** | 2 | Posts a comment, then edits and deletes it as the author |
| **Project Creation** | 1 | Creates a project with a unique name and reads it back |

Weights reflect realistic usage patterns — board interactions are the most frequent, followed by browsing and commenting.

## Prerequisites

- **Python 3.10+**
- **Taskify API running** — start it via Docker Compose (see below) or manually
- The API must have **seed data loaded** (5 users, 3 projects, 12 tasks, 6 comments)

## Installation

```bash
cd concept/tests/performance
pip install -r requirements.txt
```

## Running the Tests

### With Web UI (Interactive)

```bash
locust -f locustfile.py --host=http://localhost:3000
```

Open [http://localhost:8089](http://localhost:8089) in your browser to configure users, spawn rate, and monitor results in real time.

### Headless (CI / Automated)

```bash
locust -f locustfile.py --host=http://localhost:3000 --headless -u 50 -r 10 -t 2m --csv=results/taskify
```

| Flag | Description |
|---|---|
| `-u 50` | Simulate 50 concurrent users |
| `-r 10` | Spawn 10 users per second |
| `-t 2m` | Run for 2 minutes |
| `--csv=results/taskify` | Export CSV results to `results/` |

### With Docker Compose

```bash
# Start the Taskify application
cd concept && docker compose up -d

# Run performance tests
cd tests/performance
locust -f locustfile.py --host=http://localhost:3000 --headless -u 50 -r 10 -t 2m --csv=results/taskify
```

### Programmatic Execution

```bash
python locustfile.py
```

Runs with default settings: 50 users, spawn rate 10, 2-minute duration.

## Performance Baselines

| Metric | Target |
|---|---|
| GET requests p95 | < 500 ms |
| POST/PATCH requests p95 | < 1000 ms |
| Error rate | < 1% |
| Throughput | > 50 req/s at 50 users |

Tests automatically flag responses that exceed these thresholds as failures in the Locust report.

## Viewing Results

### Web UI

The Locust web UI at `http://localhost:8089` provides real-time charts for:
- Requests per second
- Response time percentiles
- Failure rate
- Number of active users

### CSV Reports

When run with `--csv=results/taskify`, Locust generates:

| File | Contents |
|---|---|
| `results/taskify_stats.csv` | Aggregate statistics per endpoint |
| `results/taskify_stats_history.csv` | Time-series data |
| `results/taskify_failures.csv` | Failed request details |
| `results/taskify_exceptions.csv` | Python exceptions |

### Environment Variable

Set `TASKIFY_BASE_URL` to override the default host:

```bash
export TASKIFY_BASE_URL=http://my-staging-server:3000
locust -f locustfile.py
```
