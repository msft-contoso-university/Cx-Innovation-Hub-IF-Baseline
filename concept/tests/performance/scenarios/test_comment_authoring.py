"""
Scenario: Comment Authoring

Simulates a user posting a comment on a task, then editing it,
and finally deleting it.  Covers the write and delete paths of the
comments API not exercised by the read-focused CommentActivityUser.

Endpoints exercised:
  POST   /api/tasks/:taskId/comments
  PUT    /api/comments/:id
  DELETE /api/comments/:id

Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

INITIAL_COMMENTS = [
    "Starting work on this.",
    "Investigating the root cause.",
    "Draft implementation done.",
    "Added initial test coverage.",
    "Ready for review.",
]

EDITED_COMMENTS = [
    "Updated after review feedback.",
    "Revised with additional context.",
    "Corrected implementation details.",
    "Refined based on discussion.",
]


class CommentAuthoringUser(TaskifyBaseUser):
    """Simulates a user who posts a comment, edits it, then deletes it."""

    weight = 1

    @task
    def comment_authoring_lifecycle(self):
        """Post a comment, edit it, then delete it — full comment lifecycle."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------ #
        # 1. Fetch tasks for the chosen project
        # ------------------------------------------------------------------ #
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_authoring] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_authoring tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_obj = random.choice(tasks)
        task_id = task_obj.get("id", task_obj.get("_id"))

        # ------------------------------------------------------------------ #
        # 2. Post a new comment
        # ------------------------------------------------------------------ #
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(INITIAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_authoring] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_authoring post: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_authoring post: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        # ------------------------------------------------------------------ #
        # 3. Edit the comment
        # ------------------------------------------------------------------ #
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_authoring edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_authoring edit: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------ #
        # 4. Delete the comment (cleanup)
        # ------------------------------------------------------------------ #
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_authoring delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_authoring delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
