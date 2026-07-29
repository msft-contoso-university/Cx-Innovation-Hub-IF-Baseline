"""
Scenario: Comment Moderation

Simulates a user editing and deleting their own comments on a task.
Uses the X-User-Id header (set by the base class) so the ownership
checks in PUT /api/comments/:id and DELETE /api/comments/:id are exercised.

Covered endpoints:
  PUT    /api/comments/:id
  DELETE /api/comments/:id

Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDIT_TEXTS = [
    "Clarified the acceptance criteria.",
    "Updated after the design review.",
    "Revised based on feedback.",
    "Added more context.",
    "Fixed a typo in the original comment.",
]


class CommentModerationUser(TaskifyBaseUser):
    """User that posts, edits, then deletes a comment — exercising PUT and DELETE."""

    weight = 2

    @task
    def comment_moderation(self):
        """Post a comment then edit and delete it in the same flow."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks for the project to pick one
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

        # ── Step 1: Post a comment ────────────────────────────────────────
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Initial comment from load test"},
            headers={"X-User-Id": self.current_user_id},
            name="[moderation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_moderation post: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))

        # ── Step 2: Edit the comment ──────────────────────────────────────
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation edit: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation edit: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        # ── Step 3: Delete the comment ────────────────────────────────────
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
                    f"comment_moderation delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
