"""
Scenario: Task Management

Simulates a user performing full task lifecycle operations:
  - Create a task in a project          POST /api/projects/:projectId/tasks
  - Update a task's title/description   PUT  /api/tasks/:id
  - Assign a user to a task             PATCH /api/tasks/:id/assign
  - Delete a task                       DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


def _random_title(prefix: str = "Perf-Task") -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}-{suffix}"


class TaskManagementUser(TaskifyBaseUser):
    """User that exercises the full task CRUD lifecycle."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create, update, assign, and delete a task."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ── Step 1: create a new task ────────────────────────────────────────
        new_title = _random_title()
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": new_title, "description": "Locust perf task"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created = resp.json()

        task_id = created.get("id", created.get("_id"))
        if not task_id:
            return

        # ── Step 2: update the task title ────────────────────────────────────
        updated_title = _random_title("Updated-Task")
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated by Locust"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Step 3: assign a user ────────────────────────────────────────────
        assigned_user_id = None
        if self.users:
            assigned_user_id = str(random.choice(self.users).get("id", ""))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Step 4: delete the task we created ──────────────────────────────
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
