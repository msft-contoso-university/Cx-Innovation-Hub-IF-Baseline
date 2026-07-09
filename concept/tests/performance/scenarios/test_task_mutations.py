"""
Scenario: Task Mutations

Simulates a user performing write operations on tasks and projects:
creating a project, creating a task, editing it, assigning a user,
then deleting it.  Exercises all write paths for the tasks resource.
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
    "Implement feature flag toggle",
    "Write integration tests",
    "Fix flaky CI pipeline",
    "Update API documentation",
    "Refactor authentication module",
    "Add rate limiting middleware",
    "Migrate database schema",
    "Review pull request #42",
]

TASK_DESCRIPTIONS = [
    "This task requires careful review before merging.",
    "Estimated effort: 2 story points.",
    "Blocked by upstream dependency.",
    "Follow the existing pattern in the codebase.",
    None,
]


class TaskMutationUser(TaskifyBaseUser):
    """User that performs full task lifecycle: create, update, assign, delete."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, create a task in it, update it, assign a user, then delete it."""
        # ------------------------------------------------------------------
        # 1. Create a project so the task has a valid project_id
        # ------------------------------------------------------------------
        project_name = f"Perf Test Project {uuid.uuid4().hex[:8]}"
        project_id = None

        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by load test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        # ------------------------------------------------------------------
        # 2. Create a task in the new project
        # ------------------------------------------------------------------
        task_id = None

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
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        # ------------------------------------------------------------------
        # 3. Update the task title/description
        # ------------------------------------------------------------------
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{random.choice(TASK_TITLES)} (updated)",
                "description": "Updated by load test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"task_lifecycle update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 4. Assign a user to the task
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
            if resp.status_code not in (200, 201):
                resp.failure(f"task_lifecycle assign task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 5. Delete the task (and implicitly the project is left intact)
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 204):
                resp.failure(f"task_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
