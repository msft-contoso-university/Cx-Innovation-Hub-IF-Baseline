"""
Scenario: Task Lifecycle

Simulates a user creating a task, editing it, assigning a teammate and
finally deleting it, so the run leaves no residual data behind.
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
    "Perf task: refine backlog item",
    "Perf task: update integration docs",
    "Perf task: triage incoming bug",
    "Perf task: review deployment plan",
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates, edits, assigns and deletes a task."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a task, update it, (un)assign a user, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Create the task
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"{random.choice(TASK_TITLES)} {uuid.uuid4().hex[:8]}",
                "description": "Created by the task lifecycle performance scenario.",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
            created = resp.json()

        task_id = created.get("id", created.get("_id"))
        if task_id is None:
            return

        # Update title and description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{created.get('title', 'Perf task')} (edited)",
                "description": "Updated by the task lifecycle performance scenario.",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Assign a teammate (falls back to unassign when no users were seeded)
        assignee_id = None
        if self.users:
            assignee = random.choice(self.users)
            assignee_id = assignee.get("id", assignee.get("_id"))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Clean up so repeated runs do not grow the dataset
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
