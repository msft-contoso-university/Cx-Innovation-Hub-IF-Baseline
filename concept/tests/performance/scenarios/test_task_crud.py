"""
Scenario: Task CRUD Operations

Simulates the full task lifecycle: creating a project, creating a task,
updating it, assigning a user, and cleaning up with a delete.

Covers:
  POST /api/projects
  POST /api/projects/:projectId/tasks
  PUT  /api/tasks/:id
  PATCH /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT p95 < 1500 ms, PATCH/DELETE p95 < 1000 ms.
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
    "Fix responsive layout bug",
    "Add unit tests for auth module",
    "Review pull request",
    "Update API documentation",
    "Optimize database queries",
    "Set up CI/CD pipeline",
    "Refactor error handling",
]

TASK_DESCRIPTIONS = [
    "High priority item for next sprint.",
    "Needs to be completed before release.",
    "Blocked by upstream dependency.",
    None,
]


class TaskCrudUser(TaskifyBaseUser):
    """User that creates, updates, assigns, and deletes tasks."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, manage a task through its full lifecycle, then delete it."""
        # Step 1: Create a project
        project_name = f"Perf Project {uuid.uuid4().hex[:8]}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Ephemeral load-test project"},
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

        # Step 2: Create a task in the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": random.choice(TASK_TITLES),
                "description": random.choice(TASK_DESCRIPTIONS),
            },
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
            task_obj = resp.json()

        task_id = task_obj.get("id", task_obj.get("_id"))

        # Step 3: Update the task title/description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated: {random.choice(TASK_TITLES)}",
                "description": "Updated via load test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Step 4: Assign a random user to the task
        if self.users:
            user = random.choice(self.users)
            user_id = user.get("id", user.get("_id"))

            with self.client.patch(
                f"/api/tasks/{task_id}/assign",
                json={"assigned_user_id": user_id},
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code < 200 or resp.status_code >= 300:
                    resp.failure(f"task_lifecycle assign task: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"task_lifecycle assign task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        # Step 5: Delete the task (clean up)
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
