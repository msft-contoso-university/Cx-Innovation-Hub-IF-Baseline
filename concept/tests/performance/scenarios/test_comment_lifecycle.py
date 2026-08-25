"""
Scenario: Comment Lifecycle

Simulates an author posting a comment on a task they created, editing it and
deleting it again.  The scenario provisions its own project and task so the
edit/delete authorization checks (X-User-Id must match the comment author)
always run against data owned by the simulated user.
Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

WRITE_THRESHOLD_MS = 1000


class CommentLifecycleUser(TaskifyBaseUser):
    """User that exercises the comment edit and delete endpoints."""

    weight = 1

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
    def comment_lifecycle(self):
        """Create a task, comment on it, edit the comment, then delete it."""
        suffix = uuid.uuid4().hex[:8]

        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Comments {suffix}",
                "description": "Created by the comment lifecycle performance scenario",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "comment_lifecycle create project"):
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": f"Perf Comment Task {suffix}"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "comment_lifecycle create task"):
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Perf comment {suffix}"},
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "comment_lifecycle create comment"):
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # Edit the comment as its author
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"Perf comment {suffix} (edited)"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_lifecycle edit comment")

        # Delete the comment as its author
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_lifecycle delete comment")

        # Clean up the task created by this iteration
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_lifecycle delete task")
