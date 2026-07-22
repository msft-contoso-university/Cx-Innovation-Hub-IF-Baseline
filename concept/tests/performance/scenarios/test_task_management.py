"""
Scenario: Task Management

Simulates a developer creating a project, creating tasks, updating task
details, assigning users, and deleting tasks.

Endpoints exercised:
  POST   /api/projects
  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST p95 < 1000 ms, PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


TASK_TITLES = [
    "Implement login page",
    "Fix navigation bug",
    "Add dark mode support",
    "Write API documentation",
    "Refactor database schema",
    "Add unit tests",
    "Deploy to staging",
    "Review pull request",
]

TASK_DESCRIPTIONS = [
    "This task needs careful attention.",
    "Follow the design spec.",
    "Coordinate with the backend team.",
    None,
]


class TaskManagementUser(TaskifyBaseUser):
    """User that creates projects and manages tasks through their full lifecycle."""

    weight = 3

    @task(2)
    def create_project(self):
        """Create a new project via POST /api/projects."""
        project_name = f"Perf Test Project {uuid.uuid4().hex[:8]}"

        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by performance test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(5)
    def create_and_manage_task(self):
        """Create a task then update, assign, and delete it.

        The full lifecycle ensures POST, PUT, PATCH /assign, and DELETE are
        all exercised in a single user journey.
        """
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))
        suffix = uuid.uuid4().hex[:6]
        title = f"{random.choice(TASK_TITLES)} [{suffix}]"

        # ── Create a task ───────────────────────────────────────────────────
        created_task_id = None
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
                resp.failure(f"create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            data = resp.json()
            created_task_id = data.get("id", data.get("_id"))

        if not created_task_id:
            return

        # ── Update the task title and description ───────────────────────────
        with self.client.put(
            f"/api/tasks/{created_task_id}",
            json={
                "title": f"Updated: {title}",
                "description": "Updated by performance test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Assign a user to the task ────────────────────────────────────────
        assign_user_id = None
        if self.users:
            user = random.choice(self.users)
            assign_user_id = user.get("id", user.get("_id"))

        with self.client.patch(
            f"/api/tasks/{created_task_id}/assign",
            json={"assigned_user_id": assign_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Delete the task (clean up test data) ────────────────────────────
        with self.client.delete(
            f"/api/tasks/{created_task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
