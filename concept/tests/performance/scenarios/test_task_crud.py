"""
Scenario: Task CRUD Operations

Simulates a user creating a task, updating its title, assigning a user,
and finally deleting it.  Covers the write-path endpoints that are
absent from the read-heavy browse/kanban scenarios.

Endpoints exercised (hook coverage):
  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement login page",
    "Write unit tests for auth module",
    "Fix pagination bug",
    "Update API documentation",
    "Add dark mode support",
    "Refactor database queries",
    "Set up CI pipeline",
    "Conduct code review",
]


class TaskCrudUser(TaskifyBaseUser):
    """User that creates, edits, assigns, and deletes tasks."""

    weight = 3

    @task
    def task_crud_flow(self):
        """Create a task then update, assign, and delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # --- POST /api/projects/:projectId/tasks ----------------------------
        new_title = random.choice(TASK_TITLES)
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": new_title},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_crud create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_id = resp.json().get("id") or resp.json().get("_id")

        if not task_id:
            return

        # --- PUT /api/tasks/:id --------------------------------------------
        updated_title = f"{new_title} (updated)"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated by perf test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_crud update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- PATCH /api/tasks/:id/assign -----------------------------------
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
                resp.failure(f"task_crud assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- DELETE /api/tasks/:id ----------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_crud delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"task_crud delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
