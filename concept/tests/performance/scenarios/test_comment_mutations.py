"""
Scenario: Comment Mutations

Simulates a user editing and then deleting their own comment.  Covers:

  PUT    /api/comments/:id
  DELETE /api/comments/:id

Thresholds: PUT p95 < 1000 ms, DELETE p95 < 500 ms.

Ownership model: the X-User-Id header must match the comment's user_id.
The base class sets X-User-Id on every request, so comments are posted and
then operated on with the same user id.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDIT_TEXTS = [
    "Clarified the acceptance criteria.",
    "Updated after discussion with the team.",
    "Fixed a typo in my earlier comment.",
    "Added more context based on feedback.",
    "Revised estimate after investigation.",
]

INITIAL_TEXTS = [
    "Initial comment from load test.",
    "Placeholder comment for mutation test.",
    "Draft comment — will be edited soon.",
]


class CommentMutationsUser(TaskifyBaseUser):
    """User that creates, edits, and deletes their own comments."""

    weight = 1  # Lower weight — these are destructive write operations

    @task
    def comment_edit_delete_lifecycle(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ── Fetch tasks for the project ───────────────────────────────────
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_mut] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mut tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_id = random.choice(tasks).get("id", random.choice(tasks).get("_id"))

        # ── Step 1: Post a comment ────────────────────────────────────────
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(INITIAL_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_mut] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_mut post: expected 201, got {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        # ── Step 2: Edit the comment ──────────────────────────────────────
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mut edit: expected 200, got {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mut edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Step 3: Delete the comment ────────────────────────────────────
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mut delete: expected 200, got {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"comment_mut delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
