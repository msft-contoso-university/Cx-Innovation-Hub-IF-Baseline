"""
Scenario: Task Lifecycle Management

Simulates a user performing the full task lifecycle: creating a project,
creating a task inside it, editing the task, assigning it to a teammate,
adding and editing a comment, then cleaning up by deleting the comment and
the task. Each iteration creates and removes its own data so the scenario
stays isolated and repeatable.

Thresholds: GET p95 < 500 ms, POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


def _check(resp, label):
    """Enforce the 1000ms p95 mutation threshold and report failures."""
    if resp.status_code < 200 or resp.status_code >= 300:
        resp.failure(f"{label}: status {resp.status_code}")
        return False
    if resp.elapsed.total_seconds() * 1000 > 1000:
        resp.failure(
            f"{label}: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
        )
        return False
    return True


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises the full create/update/assign/delete task flow."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create, update, assign, comment on, and delete a task."""
        run_id = uuid.uuid4().hex[:8]

        # Create a project to host the task.
        project_id = None
        with self.client.post(
            "/api/projects",
            json={"name": f"Perf Project {run_id}", "description": "Load test project"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if _check(resp, "task_lifecycle create project"):
                project_id = resp.json().get("id")
        if not project_id:
            return

        # Create a task inside the project.
        task_id = None
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": f"Perf Task {run_id}", "description": "Load test task"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if _check(resp, "task_lifecycle create task"):
                task_id = resp.json().get("id")
        if not task_id:
            return

        # Update the task's title/description.
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"Perf Task {run_id} (updated)", "description": "Updated by load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            _check(resp, "task_lifecycle update task")

        # Assign the task to a random known user.
        assignee = random.choice(self.users) if self.users else None
        assignee_id = assignee.get("id", assignee.get("_id")) if assignee else None
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            _check(resp, "task_lifecycle assign task")

        # Add a comment, then edit it, then delete it.
        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Load test comment"},
            headers={"X-User-Id": self.current_user_id},
            name="[lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if _check(resp, "task_lifecycle add comment"):
                comment_id = resp.json().get("id")

        if comment_id:
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": "Load test comment (edited)"},
                headers={"X-User-Id": self.current_user_id},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                _check(resp, "task_lifecycle edit comment")

            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers={"X-User-Id": self.current_user_id},
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                _check(resp, "task_lifecycle delete comment")

        # Clean up the task itself.
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            _check(resp, "task_lifecycle delete task")
