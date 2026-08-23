"""
Scenario: Task Lifecycle

Simulates a planner creating a project, adding a task to it, editing the task,
assigning it to a teammate and finally deleting it — the full write path of the
task API.  Each iteration creates and removes its own data so repeated runs stay
isolated from the seeded demo content.
Thresholds: POST p95 < 1000 ms, PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Load test task",
    "Perf smoke task",
    "Throughput probe task",
    "Latency probe task",
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises the create/update/assign/delete task write path."""

    weight = 2

    def _check(self, resp, label, threshold_ms=1000):
        """Fail the sample on a non-2xx status or a threshold breach."""
        if resp.status_code < 200 or resp.status_code >= 300:
            resp.failure(f"{label}: status {resp.status_code}")
            return False
        if resp.elapsed.total_seconds() * 1000 > threshold_ms:
            resp.failure(
                f"{label}: response time {resp.elapsed.total_seconds()*1000:.0f}ms > {threshold_ms}ms"
            )
            return False
        return True

    @task
    def task_lifecycle(self):
        """Create a project and task, update, assign then delete the task."""
        run_id = uuid.uuid4().hex[:8]

        # Create a dedicated project so the scenario never mutates seed data
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf project {run_id}",
                "description": "Created by the task lifecycle performance scenario",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle create project"):
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        # Create a task inside the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"{random.choice(TASK_TITLES)} {run_id}",
                "description": "Created by the task lifecycle performance scenario",
            },
            name="POST /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle create task"):
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))
        if not task_id:
            return

        # Edit the task title and description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated perf task {run_id}",
                "description": "Updated by the task lifecycle performance scenario",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle update task")

        # Assign the task to a known user (or unassign when no users are seeded)
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
