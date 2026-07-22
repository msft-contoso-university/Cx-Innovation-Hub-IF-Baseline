"""
Scenario: Task Mutations

Simulates a user creating, updating, reassigning, and deleting a task.
Covers: POST /api/projects/:projectId/tasks, PUT /api/tasks/:id,
        PATCH /api/tasks/:id/assign, DELETE /api/tasks/:id.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement feature X",
    "Fix bug in module Y",
    "Review PR #42",
    "Write tests for Z",
    "Update documentation",
    "Refactor authentication module",
    "Performance optimisation",
    "Security audit",
]


class TaskMutationsUser(TaskifyBaseUser):
    """User that creates, edits, reassigns, and removes tasks."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a task, update it, assign a user, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # POST — create task
        task_id = None
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": random.choice(TASK_TITLES)},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
                return
            data = resp.json()
            task_id = data.get("id", data.get("_id"))

        if not task_id:
            return

        # PUT — update task title and description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": random.choice(TASK_TITLES), "description": "Updated via load test."},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )

        # PATCH assign — assign a random user
        if self.users:
            user = random.choice(self.users)
            user_id = user.get("id", user.get("_id"))
            with self.client.patch(
                f"/api/tasks/{task_id}/assign",
                json={"assigned_user_id": user_id},
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"task_lifecycle assign: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"task_lifecycle assign: response time "
                        f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                    )

        # DELETE — clean up the created task
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
