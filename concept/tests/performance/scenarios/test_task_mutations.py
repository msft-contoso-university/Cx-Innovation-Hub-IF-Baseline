"""
Scenario: Task Mutations

Simulates a user creating a task, updating its title/description, assigning
a team member, and finally deleting it.  Covers the following endpoints:

  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement feature",
    "Fix regression",
    "Write documentation",
    "Add unit tests",
    "Refactor module",
    "Review pull request",
    "Deploy to staging",
    "Update dependencies",
    "Investigate bug",
    "Create design mockup",
]

TASK_DESCRIPTIONS = [
    "This task was created by the load test.",
    "Needs discussion in the next sprint.",
    "Follow up with the team lead before starting.",
    None,
]


def _random_suffix(n: int = 4) -> str:
    return "".join(random.choices(string.digits, k=n))


class TaskMutationsUser(TaskifyBaseUser):
    """User that creates, updates, assigns and deletes tasks."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Full create → update → assign → delete lifecycle for a task."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ── Step 1: Create a task ──────────────────────────────────────────
        title = f"{random.choice(TASK_TITLES)} {_random_suffix()}"
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": title,
                "description": random.choice(TASK_DESCRIPTIONS),
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create: expected 201, got {resp.status_code}")
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

        # ── Step 2: Update the task title ─────────────────────────────────
        updated_title = f"Updated {title}"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": updated_title,
                "description": "Updated by load test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: expected 200, got {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Step 3: Assign a user ──────────────────────────────────────────
        assigned_user_id = self.current_user_id if self.users else None
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign: expected 200, got {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Step 4: Delete the task ────────────────────────────────────────
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete: expected 200, got {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"task_lifecycle delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
