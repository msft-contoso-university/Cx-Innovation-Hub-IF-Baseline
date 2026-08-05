"""
Scenario: Comment Moderation

Simulates a user editing and deleting their own comments on a task.
Exercises the author-only PUT/DELETE comment endpoints that are not
covered by the read/post CommentActivityUser scenario.

Thresholds: PUT p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDITED_COMMENT_TEXTS = [
    "Edited: looks good, moving forward.",
    "Edited: need more details on this one.",
    "Edited: ready for review.",
    "Edited: updated the implementation.",
]


class CommentModerationUser(TaskifyBaseUser):
    """User that posts a comment, edits it, then deletes it."""

    weight = 1

    @task
    def edit_and_delete_own_comment(self):
        """Post a comment as the current user, then edit and delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[moderation] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"moderation tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Post a comment as the current user so we own it
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Original comment for moderation test"},
            headers={"X-User-Id": self.current_user_id},
            name="[moderation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"moderation post: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        # Edit the comment
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"edit_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"edit_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
