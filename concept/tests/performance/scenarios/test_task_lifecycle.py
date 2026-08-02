"""
Scenario: Task Lifecycle

Simulates a user creating a project, adding a task, editing it, assigning it to a
team member, and finally deleting it.  Covers the write-path endpoints that complete
Kanban board management.

Covered endpoints:
  POST   /api/projects
  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_NAME_WORDS = [
    "Alpha", "Beta", "Gamma", "Delta", "Epsilon",
    "Horizon", "Nexus", "Apex", "Velocity", "Forge",
]

TASK_TITLES = [
    "Implement login screen",
    "Write unit tests",
    "Fix responsive layout",
    "Update API documentation",
    "Refactor database queries",
    "Add pagination support",
    "Review pull request",
    "Set up CI pipeline",
]

TASK_DESCRIPTIONS = [
    "High priority — needed for the upcoming milestone.",
    "Follow the existing patterns in the codebase.",
    "See linked ticket for acceptance criteria.",
    None,
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises the full task write lifecycle."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, add a task, update it, assign it, then delete it."""
        # --- Step 1: Create a project ---
        project_name = f"{random.choice(PROJECT_NAME_WORDS)} Project {random.randint(100, 999)}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Load test project"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create_project: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        # --- Step 2: Add a task to the project ---
        task_title = random.choice(TASK_TITLES)
        task_description = random.choice(TASK_DESCRIPTIONS)
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": task_description},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        # --- Step 3: Update the task title ---
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"{task_title} (updated)", "description": "Updated in load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Step 4: Assign a user to the task ---
        if self.users:
            assigned_user = random.choice(self.users)
            assigned_user_id = assigned_user.get("id", assigned_user.get("_id"))
            with self.client.patch(
                f"/api/tasks/{task_id}/assign",
                json={"assigned_user_id": assigned_user_id},
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"task_lifecycle assign_task: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"task_lifecycle assign_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        # --- Step 5: Delete the task ---
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
