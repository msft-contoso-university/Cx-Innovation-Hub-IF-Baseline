"""
Scenario: Comment Moderation

Simulates a user posting a comment on a task and then editing and deleting it
(exercising author-only PUT and DELETE comment endpoints).

Endpoints covered:
  PUT    /api/comments/:id
  DELETE /api/comments/:id
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

ORIGINAL_COMMENTS = [
    "Initial thoughts on this task.",
    "Needs more context before starting.",
    "Assigned to myself — will tackle next sprint.",
    "Blocked, waiting on design approval.",
    "Started implementation.",
]

EDITED_SUFFIXES = [
    " (edited: clarified scope)",
    " (edited: updated estimate)",
    " (edited: typo fixed)",
    " (edited: added detail)",
]


class CommentModerationUser(TaskifyBaseUser):
    """User that creates, edits, and deletes their own comments."""

    weight = 1

    @task
    def comment_moderation(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        # Pick a random project and get its tasks
        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_mod] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation get_tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # ------------------------------------------------------------------
        # Step 1: Post a new comment (so we own it)
        # ------------------------------------------------------------------
        content = random.choice(ORIGINAL_COMMENTS)
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": content},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_mod] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_moderation post_comment: status {resp.status_code}")
                return
            created_comment = resp.json()

        comment_id = created_comment.get("id", created_comment.get("_id"))

        # ------------------------------------------------------------------
        # Step 2: Edit the comment (author-only)
        # ------------------------------------------------------------------
        edited_content = content + random.choice(EDITED_SUFFIXES)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": edited_content},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation edit_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation edit_comment: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # Step 3: Delete the comment (cleanup, author-only)
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation delete_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation delete_comment: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
