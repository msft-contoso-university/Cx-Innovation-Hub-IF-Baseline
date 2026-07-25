"""
Scenario: Task Mutations

Simulates a user creating projects, creating tasks, editing tasks, assigning
users, and deleting tasks.  Covers the write-path endpoints that are critical
to the Kanban workflow.
Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement login flow",
    "Add unit tests",
    "Fix authentication bug",
    "Update API documentation",
    "Refactor database layer",
    "Add error handling",
    "Performance optimization",
    "Code review feedback",
]

TASK_DESCRIPTIONS = [
    "Tracked in sprint backlog.",
    "See architecture doc for details.",
    "Affects the main user flow.",
    None,
]

PROJECT_NAMES = [
    "Load Test Project",
    "Perf Suite Alpha",
    "Benchmark Run",
    "Stress Test Batch",
]


def _rand_suffix():
    return "".join(random.choices(string.ascii_lowercase, k=6))


class TaskMutationsUser(TaskifyBaseUser):
    """User that exercises the write-path task and project endpoints."""

    weight = 2

    @task(2)
    def create_project(self):
        """POST /api/projects — create a new project."""
        name = f"{random.choice(PROJECT_NAMES)}-{_rand_suffix()}"
        with self.client.post(
            "/api/projects",
            json={"name": name, "description": "Created by load test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(3)
    def task_lifecycle(self):
        """Full task write lifecycle: create → edit → assign → delete."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # --- Step 1: POST /api/projects/:projectId/tasks ---
        title = f"{random.choice(TASK_TITLES)} [{_rand_suffix()}]"
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": title,
                "description": random.choice(TASK_DESCRIPTIONS),
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_data = resp.json()

        task_id = task_data.get("id", task_data.get("_id"))
        if not task_id:
            return

        # --- Step 2: PUT /api/tasks/:id ---
        new_title = f"{title} (updated)"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": new_title, "description": "Updated by load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Step 3: PATCH /api/tasks/:id/assign ---
        assigned_user_id = None
        if self.users:
            assigned_user = random.choice(self.users)
            assigned_user_id = assigned_user.get("id", assigned_user.get("_id"))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Step 4: DELETE /api/tasks/:id ---
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
