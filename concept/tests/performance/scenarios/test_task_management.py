"""
Scenario: Task Management Lifecycle

Simulates a user creating a project, creating a task within it,
updating the task title, assigning a user, and finally deleting it.
Covers write operations not exercised by other read-heavy scenarios.

Endpoints exercised:
  POST /api/projects
  POST /api/projects/:projectId/tasks
  PUT  /api/tasks/:id
  PATCH /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST p95 < 1000 ms, PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_NAMES = [
    "Perf Test Project",
    "Load Test Initiative",
    "Benchmark Sprint",
    "Stress Test Board",
    "Capacity Planning",
]

TASK_TITLES = [
    "Implement feature flag",
    "Write unit tests",
    "Update documentation",
    "Refactor database layer",
    "Fix edge case in parser",
    "Add error handling",
    "Review pull request",
    "Deploy to staging",
]


class TaskManagementUser(TaskifyBaseUser):
    """Simulates the full task lifecycle: create project → create task →
    update → assign → delete."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, manage a task inside it, then clean up."""
        # ------------------------------------------------------------------ #
        # 1. Create a project
        # ------------------------------------------------------------------ #
        project_name = f"{random.choice(PROJECT_NAMES)} {int(time.time() * 1000) % 100000}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by load test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create project: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        # ------------------------------------------------------------------ #
        # 2. Create a task in that project
        # ------------------------------------------------------------------ #
        task_title = random.choice(TASK_TITLES)
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": "Created by load test"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))
        if not task_id:
            return

        # ------------------------------------------------------------------ #
        # 3. Update the task title
        # ------------------------------------------------------------------ #
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"{task_title} (updated)", "description": "Updated by load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------ #
        # 4. Assign the current user to the task
        # ------------------------------------------------------------------ #
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": self.current_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------ #
        # 5. Delete the task (cleanup)
        # ------------------------------------------------------------------ #
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
