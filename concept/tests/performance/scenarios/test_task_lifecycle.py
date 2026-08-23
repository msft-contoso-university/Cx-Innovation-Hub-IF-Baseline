"""
Scenario: Task Lifecycle

Simulates the full task management lifecycle within a project: creating a
task, editing it, assigning it to a user, and finally deleting it.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Fix login bug",
    "Write onboarding docs",
    "Review pull request",
    "Update dependency versions",
    "Investigate flaky test",
    "Prepare sprint demo",
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates, edits, assigns, and deletes tasks."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a task, update it, assign a user, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Create a task in the project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": random.choice(TASK_TITLES)},
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
                return
            task_data = resp.json()

        task_id = task_data.get("id", task_data.get("_id"))
        if task_id is None:
            return

        # Edit the task's title/description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"{random.choice(TASK_TITLES)} (updated)", "description": "Updated via load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Assign the task to a random user (or unassign if no users available)
        assignee = random.choice(self.users) if self.users else None
        assignee_id = assignee.get("id", assignee.get("_id")) if assignee else None
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

        # Clean up by deleting the task created during this task run
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
