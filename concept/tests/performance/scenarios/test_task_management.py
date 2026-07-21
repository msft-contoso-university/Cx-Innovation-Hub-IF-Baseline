"""
Scenario: Task Management Lifecycle

Simulates a developer creating a project, adding tasks to it, editing and
assigning those tasks, then cleaning up by deleting them.

Endpoints covered:
  POST   /api/projects
  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random
import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement authentication",
    "Fix pagination bug",
    "Add dark mode support",
    "Write integration tests",
    "Refactor database layer",
    "Update API documentation",
    "Performance optimisation",
    "Code review changes",
]

TASK_DESCRIPTIONS = [
    "This needs careful attention to edge cases.",
    "Follow the existing pattern in similar modules.",
    "Ensure backwards compatibility.",
    None,
]


class TaskManagementUser(TaskifyBaseUser):
    """User that creates projects and manages the full task lifecycle."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, add a task, update it, assign a user, then delete it."""

        # --- Create a project -------------------------------------------
        project_name = f"Perf-Project-{int(time.time() * 1000) % 100000}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by load test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # --- Create a task in that project --------------------------------
        task_title = random.choice(TASK_TITLES)
        task_description = random.choice(TASK_DESCRIPTIONS)
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": task_description},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))

        # --- Update the task title/description ----------------------------
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{task_title} (updated)",
                "description": "Updated by load test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        # --- Assign a user to the task ------------------------------------
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
                resp.failure(f"task_lifecycle assign_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        # --- Delete the task ----------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"task_lifecycle delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
