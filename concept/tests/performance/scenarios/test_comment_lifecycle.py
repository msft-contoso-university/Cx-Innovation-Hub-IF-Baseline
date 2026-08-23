"""
Scenario: Comment Lifecycle

Simulates an author posting a comment on a task, editing it and deleting it.
Every request uses the same X-User-Id so the ownership checks on edit/delete
pass deterministically, and each iteration removes the comment it created.
Thresholds: POST/PUT/DELETE p95 < 1000 ms, GET p95 < 500 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class CommentLifecycleUser(TaskifyBaseUser):
    """User that edits and deletes their own comments."""

    weight = 1

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
    def comment_lifecycle(self):
        """Post a comment, edit it, then delete it as the same author."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-lifecycle] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "comment_lifecycle tasks", threshold_ms=500):
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))
        author_headers = {"X-User-Id": self.current_user_id}
        run_id = uuid.uuid4().hex[:8]

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Perf comment {run_id}"},
            headers=author_headers,
            name="[comment-lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "comment_lifecycle create"):
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"Perf comment {run_id} (edited)"},
            headers=author_headers,
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_lifecycle edit")

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers=author_headers,
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_lifecycle delete")
