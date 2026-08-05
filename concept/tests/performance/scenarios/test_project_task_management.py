"""
Scenario: Project & Task Management

Simulates a project manager creating a new project, adding a task to it,
updating the task's details, reassigning it to a different user, and
finally deleting it. Exercises the write-heavy management endpoints that
are not covered by the browsing/Kanban scenarios.

Thresholds: POST p95 < 1000 ms, PUT/PATCH p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random
import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_NAMES = [
    "Marketing Launch",
    "Mobile App Revamp",
    "Data Migration",
    "Customer Portal",
    "Infra Upgrade",
]

TASK_TITLES = [
    "Draft requirements",
    "Review design mockups",
    "Set up CI pipeline",
    "Write integration tests",
    "Prepare release notes",
]


class ProjectTaskManagementUser(TaskifyBaseUser):
    """User that creates, updates, reassigns, and deletes tasks/projects."""

    weight = 2

    @task
    def manage_project_and_task(self):
        """Create a project, add a task, update it, reassign it, then delete it."""
        # Create a new project
        with self.client.post(
            "/api/projects",
            json={
                "name": f"{random.choice(PROJECT_NAMES)} {int(time.time() * 1000)}",
                "description": "Created by performance test",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        # Create a task in the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": random.choice(TASK_TITLES), "description": "Perf test task"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_data = resp.json()

        task_id = task_data.get("id", task_data.get("_id"))
        if not task_id:
            return

        # Update the task's title/description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"{random.choice(TASK_TITLES)} (updated)", "description": "Updated by perf test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Reassign the task to a random user (or unassign it)
        assignee = random.choice(self.users) if self.users else None
        assigned_user_id = assignee.get("id", assignee.get("_id")) if assignee else None
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Clean up: delete the task
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
