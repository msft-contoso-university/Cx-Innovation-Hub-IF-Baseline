"""
Scenario: Task Management CRUD

Simulates a user creating a project, adding tasks to it, editing a task,
assigning a user to a task, and then deleting a task. This covers the
write-path endpoints that are not exercised by the read-only browse
and Kanban board scenarios.

Endpoints covered:
  POST /api/projects
  POST /api/projects/:projectId/tasks
  PUT  /api/tasks/:id
  PATCH /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement login flow",
    "Write unit tests",
    "Fix navigation bug",
    "Update dependencies",
    "Refactor database layer",
    "Add dark mode support",
    "Review pull request",
    "Deploy to staging",
]

TASK_DESCRIPTIONS = [
    "Needs careful attention to edge cases.",
    "Follow the existing conventions.",
    "Blocked by upstream dependency.",
    "High priority — affects release.",
    None,
]


class TaskManagementUser(TaskifyBaseUser):
    """User that exercises the full task CRUD write path."""

    weight = 2

    @task
    def task_management_flow(self):
        """Create a project, add a task, edit it, assign a user, then delete it."""
        # ------------------------------------------------------------------
        # 1. Create a project
        # ------------------------------------------------------------------
        project_name = f"Load-Test Project {uuid.uuid4().hex[:8]}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by load test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------
        # 2. Create a task inside the new project
        # ------------------------------------------------------------------
        task_title = random.choice(TASK_TITLES)
        task_description = random.choice(TASK_DESCRIPTIONS)

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": task_description},
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
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))

        # ------------------------------------------------------------------
        # 3. Edit the task title and description (PUT)
        # ------------------------------------------------------------------
        updated_title = f"{task_title} [updated]"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated by load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 4. Assign a random user to the task (PATCH /assign)
        # ------------------------------------------------------------------
        if self.users:
            assigned_user = random.choice(self.users)
            assigned_user_id = str(assigned_user.get("id", assigned_user.get("_id", "")))
        else:
            assigned_user_id = self.current_user_id

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 5. Delete the task to keep the database tidy
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
