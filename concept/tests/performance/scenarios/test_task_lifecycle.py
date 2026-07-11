"""
Scenario: Task Lifecycle

Simulates a user creating a project, adding a task to it, editing the task,
assigning a user, and finally deleting the task.  Covers the write-path
endpoints that were not exercised by the read-heavy browse and kanban scenarios.

Endpoints covered:
  POST /api/projects
  POST /api/projects/:projectId/tasks
  PUT  /api/tasks/:id
  PATCH /api/tasks/:id/assign
  DELETE /api/tasks/:id
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement feature flag",
    "Fix regression in auth flow",
    "Refactor database layer",
    "Add input validation",
    "Write integration tests",
    "Update API documentation",
    "Performance optimisation",
    "Security audit follow-up",
]

PROJECT_PREFIXES = ["Perf", "Load", "Stress", "Bench"]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises task creation and mutation endpoints."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, create/edit/assign/delete a task within it."""

        # ------------------------------------------------------------------
        # Step 1: Create a project
        # ------------------------------------------------------------------
        project_name = f"{random.choice(PROJECT_PREFIXES)}-{uuid.uuid4().hex[:8]}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Perf test project"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create_project: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------
        # Step 2: Create a task in the project
        # ------------------------------------------------------------------
        task_title = random.choice(TASK_TITLES)
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create_task: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))

        # ------------------------------------------------------------------
        # Step 3: Edit the task title
        # ------------------------------------------------------------------
        updated_title = task_title + " [updated]"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated by perf test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update_task: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # Step 4: Assign a user to the task
        # ------------------------------------------------------------------
        if self.users:
            assignee = random.choice(self.users)
            assignee_id = assignee.get("id", assignee.get("_id"))
        else:
            assignee_id = self.current_user_id

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign_task: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # Step 5: Delete the task (cleanup)
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete_task: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
