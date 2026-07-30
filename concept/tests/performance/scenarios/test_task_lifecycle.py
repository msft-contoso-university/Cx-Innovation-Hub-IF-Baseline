"""
Scenario: Task Lifecycle

Simulates a user creating a project, adding tasks to it, updating task
details, reassigning a task to another user, and cleaning up by deleting
the task.

Thresholds: GET p95 < 500 ms, POST/PUT/PATCH/DELETE p95 < 1000 ms.
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
    "Fix sorting bug",
    "Add export feature",
    "Write API documentation",
    "Refactor database queries",
    "Update dependencies",
    "Add unit tests for auth module",
    "Review pull request",
]

TASK_DESCRIPTIONS = [
    "Needs careful consideration of edge cases.",
    "Follow the existing patterns in the codebase.",
    "Coordinate with the backend team first.",
    None,
]

PROJECT_NAMES = [
    "Perf Test Project",
    "Load Test Initiative",
    "Benchmark Campaign",
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates projects and tasks, updates, assigns, and deletes them."""

    weight = 3

    @task
    def task_lifecycle(self):
        """Create a project, add a task, update it, assign it, then delete it."""
        # ----------------------------------------------------------------
        # 1. Create a project (POST /api/projects)
        # ----------------------------------------------------------------
        project_name = f"{random.choice(PROJECT_NAMES)} {uuid.uuid4().hex[:6]}"
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
                    f"task_lifecycle create_project: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()
            project_id = project.get("id", project.get("_id"))

        # ----------------------------------------------------------------
        # 2. Create a task in the new project (POST /api/projects/:projectId/tasks)
        # ----------------------------------------------------------------
        title = random.choice(TASK_TITLES)
        description = random.choice(TASK_DESCRIPTIONS)
        payload = {"title": title}
        if description:
            payload["description"] = description
        if self.users:
            payload["assigned_user_id"] = random.choice(self.users).get("id")

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json=payload,
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
            task_obj = resp.json()
            task_id = task_obj.get("id", task_obj.get("_id"))

        # ----------------------------------------------------------------
        # 3. Update the task's title/description (PUT /api/tasks/:id)
        # ----------------------------------------------------------------
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"{title} (updated)", "description": "Updated by load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update_task: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ----------------------------------------------------------------
        # 4. Reassign the task to a different user (PATCH /api/tasks/:id/assign)
        # ----------------------------------------------------------------
        new_user_id = None
        if self.users:
            new_user_id = random.choice(self.users).get("id")

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": new_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign_task: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ----------------------------------------------------------------
        # 5. Delete the task (DELETE /api/tasks/:id)
        # ----------------------------------------------------------------
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
