"""
Scenario: Task Lifecycle

Simulates the full CRUD lifecycle for tasks within a project:
  POST /api/projects               — create a temporary test project
  POST /api/projects/:id/tasks     — create a task in that project
  PUT  /api/tasks/:id              — update the task title / description
  PATCH /api/tasks/:id/assign      — assign a user to the task
  DELETE /api/tasks/:id            — clean up the task

Thresholds: POST/PUT/PATCH/DELETE p95 < 1500 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement feature flag support",
    "Write integration tests",
    "Refactor database layer",
    "Update API documentation",
    "Fix pagination bug",
    "Add caching layer",
    "Review pull request",
    "Set up CI pipeline",
]

TASK_DESCRIPTIONS = [
    "Needs careful attention to edge cases.",
    "See linked ticket for details.",
    "Depends on upstream API changes.",
    "Low priority for this sprint.",
    None,
]


def _rand_suffix() -> str:
    return "".join(random.choices(string.ascii_lowercase, k=6))


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises the full task CRUD path."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, create/update/assign/delete a task within it."""
        # ------------------------------------------------------------------ #
        # 1. Create a temporary project
        # ------------------------------------------------------------------ #
        project_name = f"perf-test-{_rand_suffix()}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Temporary load-test project"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle create_project: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        # ------------------------------------------------------------------ #
        # 2. Create a task in that project
        # ------------------------------------------------------------------ #
        task_title = random.choice(TASK_TITLES)
        task_desc = random.choice(TASK_DESCRIPTIONS)

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": task_desc},
            name="POST /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle create_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        # ------------------------------------------------------------------ #
        # 3. Update task title / description
        # ------------------------------------------------------------------ #
        updated_title = f"{task_title} (updated)"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated during load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle update_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )

        # ------------------------------------------------------------------ #
        # 4. Assign a user to the task
        # ------------------------------------------------------------------ #
        if self.users:
            assignee_id = str(random.choice(self.users).get("id", ""))
            with self.client.patch(
                f"/api/tasks/{task_id}/assign",
                json={"assigned_user_id": assignee_id},
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code < 200 or resp.status_code >= 300:
                    resp.failure(f"task_lifecycle assign: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1500:
                    resp.failure(
                        f"task_lifecycle assign: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                    )

        # ------------------------------------------------------------------ #
        # 5. Delete the task (cleanup)
        # ------------------------------------------------------------------ #
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )
