"""
Scenario: Task Management

Simulates a user creating tasks, updating task details, assigning/unassigning
users, and deleting tasks via the Kanban board API.
Thresholds: POST/PUT p95 < 1000 ms, PATCH p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement login page",
    "Fix pagination bug",
    "Write unit tests",
    "Update API documentation",
    "Refactor database layer",
    "Add error handling",
    "Review pull request",
    "Deploy to staging",
]

TASK_DESCRIPTIONS = [
    "High priority item from sprint planning.",
    "Tracked in issue #42.",
    "Blocked pending design review.",
    None,
]


def _rand_suffix() -> str:
    return "".join(random.choices(string.ascii_lowercase, k=4))


class TaskManagementUser(TaskifyBaseUser):
    """Simulates full task lifecycle: create, update, assign, delete."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a task, update it, assign a user, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ---------------------------------------------------------------
        # POST /api/projects/:projectId/tasks — create a task
        # ---------------------------------------------------------------
        title = f"{random.choice(TASK_TITLES)} [{_rand_suffix()}]"
        description = random.choice(TASK_DESCRIPTIONS)
        payload: dict = {"title": title}
        if description:
            payload["description"] = description

        task_id = None
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json=payload,
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
            task_id = resp.json().get("id")

        if not task_id:
            return

        # ---------------------------------------------------------------
        # PUT /api/tasks/:id — update the task
        # ---------------------------------------------------------------
        updated_title = f"Updated: {title}"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated via perf test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ---------------------------------------------------------------
        # PATCH /api/tasks/:id/assign — assign a user
        # ---------------------------------------------------------------
        if self.users:
            assignee = random.choice(self.users)
            assigned_user_id = assignee.get("id", assignee.get("_id"))
            with self.client.patch(
                f"/api/tasks/{task_id}/assign",
                json={"assigned_user_id": assigned_user_id},
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"task_lifecycle assign: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"task_lifecycle assign: response time "
                        f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        # ---------------------------------------------------------------
        # DELETE /api/tasks/:id — clean up
        # ---------------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"task_lifecycle delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
