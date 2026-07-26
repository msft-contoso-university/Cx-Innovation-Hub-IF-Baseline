"""
Scenario: Task Lifecycle

Simulates a user performing full task CRUD operations:
creating a task, updating its title/description, assigning a user,
and finally deleting it.  This covers the write-path endpoints that
complement the read-heavy Kanban board scenario.

Thresholds: POST p95 < 1500 ms, PUT p95 < 1000 ms,
            PATCH p95 < 1000 ms, DELETE p95 < 1000 ms.
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
    "Write API documentation",
    "Fix pagination bug",
    "Add dark mode support",
    "Refactor database queries",
    "Update dependencies",
    "Set up CI pipeline",
    "Create onboarding guide",
]

TASK_DESCRIPTIONS = [
    "Needs careful review before merging.",
    "Blocked until design assets arrive.",
    "Should be straightforward — see ticket for details.",
    None,
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates, updates, assigns, and deletes tasks."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a task, update it, assign a user, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # --- Create task ---
        title = f"{random.choice(TASK_TITLES)} [{uuid.uuid4().hex[:6]}]"
        payload = {
            "title": title,
            "description": random.choice(TASK_DESCRIPTIONS),
        }
        if self.users:
            payload["assigned_user_id"] = random.choice(self.users).get(
                "id", random.choice(self.users).get("_id")
            )

        task_id = None
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json=payload,
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                data = resp.json()
                task_id = data.get("id", data.get("_id"))
                if resp.elapsed.total_seconds() * 1000 > 1500:
                    resp.failure(
                        f"task_lifecycle create: response time "
                        f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                    )
            else:
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
                return

        if task_id is None:
            return

        # --- Update task (title + description) ---
        updated_title = f"{title} (updated)"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated during load test."},
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

        # --- Assign user ---
        assignee_id = None
        if self.users:
            assignee_id = random.choice(self.users).get(
                "id", random.choice(self.users).get("_id")
            )

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee_id},
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

        # --- Delete task ---
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
