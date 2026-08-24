"""
Scenario: Task Lifecycle

Simulates a project manager creating a project, adding a task to it, editing
the task, assigning it to a team member and finally deleting it.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

WRITE_THRESHOLD_MS = 1000

PROJECT_NAMES = [
    "Load Test Project",
    "Perf Sandbox",
    "Capacity Planning",
    "Throughput Trial",
]

TASK_TITLES = [
    "Investigate latency spike",
    "Update onboarding docs",
    "Refactor board rendering",
    "Add retry to API client",
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises the full create/update/assign/delete task flow."""

    weight = 2

    def _check(self, resp, label, expected_status):
        """Mark the response failed when status or latency is out of budget."""
        if resp.status_code != expected_status:
            resp.failure(f"{label}: status {resp.status_code}")
            return False
        if resp.elapsed.total_seconds() * 1000 > WRITE_THRESHOLD_MS:
            resp.failure(
                f"{label}: response time {resp.elapsed.total_seconds()*1000:.0f}ms "
                f"> {WRITE_THRESHOLD_MS}ms"
            )
            return False
        return True

    @task
    def task_lifecycle(self):
        """Create a project + task, update it, assign it, then delete it."""
        # Create a dedicated project so the scenario never mutates seed data
        with self.client.post(
            "/api/projects",
            json={
                "name": f"{random.choice(PROJECT_NAMES)} {random.randint(1, 1_000_000)}",
                "description": "Created by the Locust task lifecycle scenario.",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle create project", 201):
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        # Create a task inside the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": random.choice(TASK_TITLES),
                "description": "Created by the Locust task lifecycle scenario.",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle create task", 201):
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        # Edit the task title/description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{random.choice(TASK_TITLES)} (updated)",
                "description": "Updated by the Locust task lifecycle scenario.",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle update task", 200)

        # Assign the task to a known user (or unassign when no users exist)
        assignee = random.choice(self.users).get("id") if self.users else None
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle assign task", 200)

        # Clean up so repeated iterations do not grow the dataset unbounded
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle delete task", 200)
