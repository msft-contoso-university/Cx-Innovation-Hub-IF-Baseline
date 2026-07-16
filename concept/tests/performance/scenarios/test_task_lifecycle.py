"""
Scenario: Task Lifecycle

Simulates a user creating a new project and task, updating the task title,
assigning a user, and finally deleting the task. Covers the write-path
endpoints that are not exercised by the read-heavy kanban scenario.

Covered endpoints:
  POST   /api/projects
  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH/DELETE p95 < 1500 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement feature flag toggle",
    "Fix login redirect bug",
    "Write integration tests",
    "Update API documentation",
    "Refactor auth middleware",
    "Add rate limiting",
    "Set up CI pipeline",
    "Performance audit",
]

TASK_DESCRIPTIONS = [
    "Needs careful review before merging.",
    "Depends on the auth service update.",
    "See ticket #42 for context.",
    None,
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates, updates, assigns, and deletes tasks."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Full CRUD lifecycle: create project → create task → update → assign → delete."""

        # ------------------------------------------------------------------ #
        # 1. Create a project
        # ------------------------------------------------------------------ #
        project_name = f"Perf-Project-{uuid.uuid4().hex[:8]}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by performance test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle create project: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------ #
        # 2. Create a task in that project
        # ------------------------------------------------------------------ #
        task_title = random.choice(TASK_TITLES)
        task_description = random.choice(TASK_DESCRIPTIONS)

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": task_description},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle create task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))

        # ------------------------------------------------------------------ #
        # 3. Update the task title
        # ------------------------------------------------------------------ #
        updated_title = f"{task_title} [updated]"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": task_description},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle update task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )

        # ------------------------------------------------------------------ #
        # 4. Assign a user to the task (pick from prefetched users)
        # ------------------------------------------------------------------ #
        if self.users:
            assigned_user = random.choice(self.users)
            assigned_user_id = str(assigned_user.get("id", assigned_user.get("_id", 1)))
        else:
            assigned_user_id = self.current_user_id

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle assign task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )

        # ------------------------------------------------------------------ #
        # 5. Delete the task (clean up)
        # ------------------------------------------------------------------ #
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"task_lifecycle delete task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )
