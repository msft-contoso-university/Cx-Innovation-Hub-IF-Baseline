"""
Scenario: Task Lifecycle

Simulates a developer creating a project, adding a task, updating its title,
assigning a user, and then deleting the task.  This flow exercises all write
operations on projects and tasks that are not covered by other scenarios.

Covered endpoints:
  POST /api/projects
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


def _random_suffix(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates and manages projects and tasks via write operations."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, add a task, update it, assign a user, then delete it."""

        # ------------------------------------------------------------------
        # 1. Create a project
        # ------------------------------------------------------------------
        project_name = f"Perf Test Project {_random_suffix()}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by performance test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create_project: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------
        # 2. Create a task in the new project
        # ------------------------------------------------------------------
        task_title = f"Perf Test Task {_random_suffix()}"
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": "Performance test task"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create_task: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
                return
            task_data = resp.json()

        task_id = task_data.get("id", task_data.get("_id"))

        # ------------------------------------------------------------------
        # 3. Update the task title
        # ------------------------------------------------------------------
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"{task_title} (updated)", "description": "Updated by performance test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update_task: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 4. Assign a random user to the task
        # ------------------------------------------------------------------
        assigned_user_id = None
        if self.users:
            assigned_user_id = str(random.choice(self.users).get("id", ""))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign_task: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 5. Delete the task (clean up)
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete_task: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
