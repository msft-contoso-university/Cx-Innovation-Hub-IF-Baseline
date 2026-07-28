"""
Scenario: Task CRUD

Simulates a power user performing full task lifecycle operations:
  - Create a task in a project        (POST /api/projects/:projectId/tasks)
  - Update the task title/description (PUT  /api/tasks/:id)
  - Assign / unassign the task        (PATCH /api/tasks/:id/assign)
  - Delete the task when done         (DELETE /api/tasks/:id)

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class TaskCrudUser(TaskifyBaseUser):
    """User that performs full CRUD on tasks."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create, update, assign, then delete a task."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # --- Create ---
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf task {uuid.uuid4().hex[:6]}",
                "description": "Load test task",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"task_create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_create: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_data = resp.json()
            task_id = task_data.get("id", task_data.get("_id"))

        if not task_id:
            return

        # --- Update ---
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated {uuid.uuid4().hex[:6]}",
                "description": "Updated by load test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_update: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Assign ---
        assigned_user_id = None
        if self.users:
            assigned_user = random.choice(self.users)
            assigned_user_id = str(
                assigned_user.get("id", assigned_user.get("_id", ""))
            )

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_assign: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Delete ---
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
