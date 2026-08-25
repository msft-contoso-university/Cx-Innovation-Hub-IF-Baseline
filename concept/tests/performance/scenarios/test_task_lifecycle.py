"""
Scenario: Task Lifecycle

Simulates a project manager creating a throwaway project, adding a task to it,
editing the task, re-assigning it and finally deleting it.  Each virtual user
works only on data it created, so the scenario never mutates seed data and is
safe to run concurrently.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

WRITE_THRESHOLD_MS = 1000


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises the project/task write endpoints end to end."""

    weight = 2

    def _check(self, resp, label):
        """Fail the sample when the status code or latency is out of budget."""
        if resp.status_code < 200 or resp.status_code >= 300:
            resp.failure(f"{label}: status {resp.status_code}")
            return False
        if resp.elapsed.total_seconds() * 1000 > WRITE_THRESHOLD_MS:
            resp.failure(
                f"{label}: response time {resp.elapsed.total_seconds()*1000:.0f}ms > {WRITE_THRESHOLD_MS}ms"
            )
            return False
        return True

    @task
    def task_lifecycle(self):
        """Create a project and task, update, assign, then delete the task."""
        suffix = uuid.uuid4().hex[:8]

        # Create an isolated project for this iteration
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {suffix}",
                "description": "Created by the task lifecycle performance scenario",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle create project"):
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        # Create a task inside the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf Task {suffix}",
                "description": "Created by the task lifecycle performance scenario",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle create task"):
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        # Edit the task title/description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Perf Task {suffix} (updated)",
                "description": "Updated by the task lifecycle performance scenario",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle update task")

        # Assign the task to a seeded user (or unassign when none are available)
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
            self._check(resp, "task_lifecycle assign task")

        # Clean up the task created by this iteration
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle delete task")
