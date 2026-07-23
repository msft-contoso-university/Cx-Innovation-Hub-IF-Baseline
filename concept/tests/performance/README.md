# Taskify Performance Tests

Locust-based performance tests for the Taskify Kanban Board REST API. These tests simulate realistic user behavior — browsing projects, interacting with the Kanban board, moderating comments, and exercising create/update/delete flows — to validate response times and throughput under load.

## What Is Tested

| Scenario | Weight | Description |
|---|---|---|
| **Browse Projects** | 3 | Lists all projects, then fetches a project's details |
| **Kanban Board Flow** | 4 | Loads a project's tasks, then moves a task to the next status column |
| **Comment Activity** | 2 | Fetches comments on a task, then posts a new comment |
| **Comment Moderation** | 2 | Creates a comment, edits it as the owner, then deletes it |
| **Health Check** | 1 | Hits the `/api/health` endpoint |
| **Project Creation** | 1 | Creates a project once per simulated user session |
| **Task Lifecycle** | 2 | Creates, updates, assigns, and deletes a task |
| **User Directory** | 3 | Lists users and fetches individual user profiles |

Weights reflect realistic usage patterns — board interactions and browsing remain the most frequent, while create/delete flows run at lower weights to preserve deterministic cleanup.

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
| State-changing requests p95 | < 1000 ms |
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
