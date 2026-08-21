"""
Scenario: Task Lifecycle Management

Simulates a user managing the full lifecycle of a project and one of its
tasks: creating a project, adding a task, editing it, assigning it,
commenting on it, and cleaning up (editing/deleting the comment, then
deleting the task). Each iteration creates and removes its own data so the
scenario is self-contained, deterministic, and safe to run concurrently.

Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.

Covers the mutating endpoints previously missing from load-test coverage:
  - POST   /api/projects
  - POST   /api/projects/:projectId/tasks
  - PUT    /api/tasks/:id
  - PATCH  /api/tasks/:id/assign
  - PUT    /api/comments/:id
  - DELETE /api/comments/:id
  - DELETE /api/tasks/:id
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates, edits, and cleans up a project/task/comment."""

    weight = 2

    def _check(self, resp, label, expected_status_range=(200, 300)):
        """Fail the sample if the status or response time is out of bounds."""
        low, high = expected_status_range
        if not (low <= resp.status_code < high):
            resp.failure(f"{label}: status {resp.status_code}")
            return False
        if resp.elapsed.total_seconds() * 1000 > 1000:
            resp.failure(
                f"{label}: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
            )
            return False
        return True

    @task
    def task_lifecycle_flow(self):
        """Create a project + task, edit/assign it, comment, then clean up."""
        unique_suffix = uuid.uuid4().hex[:8]

        # 1. Create a project
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {unique_suffix}",
                "description": "Created by task_lifecycle_flow performance scenario",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle create project"):
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # 2. Create a task in the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": f"Perf Task {unique_suffix}", "description": "Initial description"},
            name="POST /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle create task"):
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))

        # 3. Edit the task
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"Perf Task {unique_suffix} (edited)", "description": "Updated"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle edit task")

        # 4. Assign the task to the simulated current user
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": self.current_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle assign task")

        # 5. Add a comment on the task (needed to exercise edit/delete below)
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Perf comment {unique_suffix}"},
            headers={"X-User-Id": self.current_user_id},
            name="[lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "task_lifecycle add comment"):
                comment = None
            else:
                comment = resp.json()

        comment_id = comment.get("id", comment.get("_id")) if comment else None

        # 6. Edit the comment (author-only)
        if comment_id is not None:
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": f"Perf comment {unique_suffix} (edited)"},
                headers={"X-User-Id": self.current_user_id},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                self._check(resp, "task_lifecycle edit comment")

            # 7. Delete the comment (author-only)
            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers={"X-User-Id": self.current_user_id},
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                self._check(resp, "task_lifecycle delete comment")

        # 8. Delete the task (cleanup)
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "task_lifecycle delete task")
