"""
Scenario: Task Management — Write Operations

Exercises create, update, assign, and delete operations for projects and tasks.

Endpoint coverage:
  POST   /api/projects
  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
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
    "Update API documentation",
    "Refactor data layer",
    "Add error handling",
    "Review pull request",
    "Deploy to staging",
    "Investigate performance issue",
    "Add input validation",
]


class TaskManagementUser(TaskifyBaseUser):
    """User that exercises create/update/assign/delete operations on tasks."""

    weight = 2

    @task(1)
    def create_project(self):
        """Create a new project to exercise POST /api/projects."""
        name = f"Load Test Project {uuid.uuid4().hex[:8]}"
        with self.client.post(
            "/api/projects",
            json={"name": name, "description": "Created by load test — safe to delete"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(4)
    def task_lifecycle(self):
        """Create a task, update it, assign a user, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))
        title = random.choice(TASK_TITLES)

        # Step 1: Create the task
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": title, "description": "Created by load test"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
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

        # Step 2: Update the task title and description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{title} (updated)",
                "description": "Updated by load test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Step 3: Assign the current user to the task
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": self.current_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Step 4: Delete the task to keep the database clean
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
