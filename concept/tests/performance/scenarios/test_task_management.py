"""
Scenario: Task Management CRUD

Simulates a user creating a task in a project, updating its title/description,
assigning it to a user, and then deleting it.  This covers the write operations
for tasks that are not exercised by the Kanban board scenario.

Endpoints covered:
  POST  /api/projects/:projectId/tasks   — create a task
  PUT   /api/tasks/:id                   — update title / description
  PATCH /api/tasks/:id/assign            — assign / unassign a user
  DELETE /api/tasks/:id                  — delete a task

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Investigate performance regression",
    "Write unit tests for auth module",
    "Update API documentation",
    "Refactor database query layer",
    "Add rate limiting middleware",
    "Fix CORS configuration",
    "Review open pull requests",
    "Set up monitoring alerts",
]

TASK_DESCRIPTIONS = [
    "This needs to be done before the next sprint.",
    "See the linked issue for context.",
    "High priority — blocks other work.",
    None,
    None,
]


class TaskManagementUser(TaskifyBaseUser):
    """User that creates, updates, assigns, and deletes tasks."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a task, update it, assign a user, then clean up."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # --- CREATE -----------------------------------------------------------
        title = random.choice(TASK_TITLES)
        description = random.choice(TASK_DESCRIPTIONS)
        payload = {"title": title}
        if description:
            payload["description"] = description

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
            task_data = resp.json()

        task_id = task_data.get("id", task_data.get("_id"))
        if not task_id:
            return

        # --- UPDATE -----------------------------------------------------------
        updated_title = f"{title} (updated)"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated by perf test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- ASSIGN -----------------------------------------------------------
        assigned_user_id = None
        if self.users:
            user = random.choice(self.users)
            assigned_user_id = str(user.get("id", user.get("_id")))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- DELETE -----------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"task_lifecycle delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
