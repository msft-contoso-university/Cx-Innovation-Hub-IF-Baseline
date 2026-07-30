"""
Scenario: Comment Moderation

Simulates a user editing and deleting their own comments on a task.
Exercises PUT /api/comments/:id and DELETE /api/comments/:id, which
require X-User-Id ownership checks.

Thresholds: POST p95 < 1000 ms, PUT p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

INITIAL_COMMENTS = [
    "Starting implementation now.",
    "Need to review the requirements first.",
    "Working on this today.",
    "Blocked — waiting for design approval.",
    "Almost done, finishing up the tests.",
]

EDITED_COMMENTS = [
    "Updated: implementation complete.",
    "Updated: requirements reviewed and understood.",
    "Updated: finished ahead of schedule.",
    "Updated: unblocked, resuming work.",
    "Updated: tests done, ready for review.",
]


class CommentModerationUser(TaskifyBaseUser):
    """User that posts, edits, and deletes their own comments."""

    weight = 2

    @task
    def comment_moderation(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks to find a target task
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[moderation] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_obj = random.choice(tasks)
        task_id = task_obj.get("id", task_obj.get("_id"))

        # ----------------------------------------------------------------
        # 1. Post a new comment as the current user
        # ----------------------------------------------------------------
        idx = random.randint(0, len(INITIAL_COMMENTS) - 1)
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": INITIAL_COMMENTS[idx]},
            headers={"X-User-Id": self.current_user_id},
            name="[moderation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_moderation post: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation post: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment = resp.json()
            comment_id = comment.get("id", comment.get("_id"))

        # ----------------------------------------------------------------
        # 2. Edit the comment (PUT /api/comments/:id)
        # ----------------------------------------------------------------
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": EDITED_COMMENTS[idx]},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation edit: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation edit: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ----------------------------------------------------------------
        # 3. Delete the comment (DELETE /api/comments/:id)
        # ----------------------------------------------------------------
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
