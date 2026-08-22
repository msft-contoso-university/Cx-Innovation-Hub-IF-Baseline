"""
Scenario: Comment Lifecycle (Edit and Delete)

Simulates a comment author posting a comment, editing it, and deleting it.
Covers the author-only edit/delete endpoints that the read-heavy comment
scenario never exercises.
Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

WRITE_THRESHOLD_MS = 1000

COMMENT_TEXTS = [
    "Starting work on this now.",
    "Pushed a fix, please re-check.",
    "Need input from the design team.",
    "Verified in the staging environment.",
]


class CommentLifecycleUser(TaskifyBaseUser):
    """User that posts, edits, and deletes their own comments."""

    weight = 2

    def _check_write(self, resp, label):
        """Fail the sample on non-2xx status or a breached latency threshold."""
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
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        author_headers = {"X-User-Id": self.current_user_id}

        # Create a comment owned by this simulated user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(COMMENT_TEXTS)},
            headers=author_headers,
            name="[comment-lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if not self._check_write(resp, "comment_lifecycle create"):
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if comment_id is None:
            return

        # Edit the comment (author-only path)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"{random.choice(COMMENT_TEXTS)} (edited)"},
            headers=author_headers,
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check_write(resp, "comment_lifecycle edit")

        # Delete the comment so repeated iterations stay data-neutral
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers=author_headers,
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check_write(resp, "comment_lifecycle delete")
