"""
Scenario: Task Lifecycle

Simulates a user creating a task, updating its title, assigning a team member,
and finally deleting it.  Exercises four endpoints not covered by other scenarios:
  POST /api/projects/:projectId/tasks
  PUT  /api/tasks/:id
  PATCH /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


def _random_title(prefix: str = "Perf task") -> str:
    suffix = "".join(random.choices(string.ascii_letters + string.digits, k=6))
    return f"{prefix} {suffix}"


class TaskLifecycleUser(TaskifyBaseUser):
    """User that runs a full create-update-assign-delete task lifecycle."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a task, update it, assign a user, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------
        # 1. Create a task
        # ------------------------------------------------------------------
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": _random_title()},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create: response time {resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
                return
            task = resp.json()

        task_id = task.get("id", task.get("_id"))

        # ------------------------------------------------------------------
        # 2. Update the task title
        # ------------------------------------------------------------------
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": _random_title("Updated perf task")},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time {resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 3. Assign the current user
        # ------------------------------------------------------------------
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": self.current_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time {resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 4. Delete the task (cleanup keeps data tidy under load)
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete: response time {resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
