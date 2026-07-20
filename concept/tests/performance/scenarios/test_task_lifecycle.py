"""
Scenario: Task Lifecycle

Simulates a user performing write operations on tasks:
  - Create a new project (POST /api/projects)
  - Create a task within that project (POST /api/projects/:projectId/tasks)
  - Update the task title/description (PUT /api/tasks/:id)
  - Assign a team member to the task (PATCH /api/tasks/:id/assign)
  - Delete the task when done (DELETE /api/tasks/:id)

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement login page",
    "Fix pagination bug",
    "Add CSV export",
    "Write integration tests",
    "Refactor database layer",
    "Update API documentation",
    "Performance optimisation",
    "Security audit",
]

TASK_UPDATES = [
    "Revised scope after review",
    "Updated acceptance criteria",
    "Added implementation notes",
    "Linked to related ticket",
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises task and project write operations."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project, add a task, update it, assign a user, then delete it."""

        # ── 1. Create a project ────────────────────────────────────────────────
        project_name = f"Perf-Project-{uuid.uuid4().hex[:8]}"
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
                    f"task_lifecycle create_project: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        # ── 2. Create a task ───────────────────────────────────────────────────
        task_title = random.choice(TASK_TITLES) + f" [{uuid.uuid4().hex[:6]}]"
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": "Load-test task"},
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

        # ── 3. Update the task ─────────────────────────────────────────────────
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": task_title,
                "description": random.choice(TASK_UPDATES),
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── 4. Assign a user ───────────────────────────────────────────────────
        assignee_id = None
        if self.users:
            assignee_id = str(random.choice(self.users).get("id", self.current_user_id))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── 5. Delete the task ─────────────────────────────────────────────────
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"task_lifecycle delete_task: {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
