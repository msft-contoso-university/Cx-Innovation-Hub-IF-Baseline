"""
Scenario: Task Management Lifecycle

Simulates a user creating a task, updating its title/description,
assigning a team member, and finally deleting it.
Covers: POST /api/projects/:projectId/tasks, PUT /api/tasks/:id,
        PATCH /api/tasks/:id/assign, DELETE /api/tasks/:id.
Thresholds: GET p95 < 500 ms, POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement login flow",
    "Write API documentation",
    "Fix pagination bug",
    "Add unit tests",
    "Refactor database queries",
    "Update dependency versions",
    "Design onboarding screen",
    "Review pull request",
    "Set up CI pipeline",
    "Performance audit",
]

TASK_DESCRIPTIONS = [
    "Needs careful review before merging.",
    "Blocked until upstream work is done.",
    "High priority — affects release.",
    "Low effort, good first issue.",
    "Requires coordination with the DB team.",
]


class TaskManagementUser(TaskifyBaseUser):
    """User that creates, edits, assigns, and deletes tasks."""

    weight = 3

    @task
    def task_lifecycle(self):
        """Full create → update → assign → delete task lifecycle."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # --- Create a new task ---
        title = random.choice(TASK_TITLES)
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
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_data = resp.json()

        task_id = task_data.get("id", task_data.get("_id"))
        if not task_id:
            return

        # --- Update the task title/description ---
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{title} (updated)",
                "description": "Updated via performance test.",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Assign a user to the task ---
        assigned_user_id = None
        if self.users:
            assigned_user_id = random.choice(self.users).get("id")

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Delete the task ---
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
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
