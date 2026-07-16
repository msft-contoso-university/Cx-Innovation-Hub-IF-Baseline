"""
Scenario: Comment Lifecycle

Simulates a user editing and then deleting a comment they authored. This covers
the ownership-enforced write paths on comments that are not exercised by the
read/create scenario.

Covered endpoints:
  PUT    /api/comments/:id
  DELETE /api/comments/:id

Thresholds: PUT/DELETE p95 < 1500 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

INITIAL_COMMENTS = [
    "Initial thought — needs review.",
    "Work in progress.",
    "Blocked pending design sign-off.",
    "Ready for QA.",
]

EDITED_COMMENTS = [
    "Updated after team review.",
    "Revised following feedback.",
    "Corrected the approach.",
    "Clarified scope.",
]


class CommentLifecycleUser(TaskifyBaseUser):
    """User that edits and deletes comments they own."""

    weight = 1

    @task
    def comment_lifecycle(self):
        """Post a comment, edit it, then delete it — exercising PUT and DELETE paths."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------ #
        # 1. Fetch tasks to find a target task
        # ------------------------------------------------------------------ #
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

        task_obj = random.choice(tasks)
        task_id = task_obj.get("id", task_obj.get("_id"))

        # ------------------------------------------------------------------ #
        # 2. Post a new comment (so we own it and can edit/delete it)
        # ------------------------------------------------------------------ #
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(INITIAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_lifecycle create: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))

        # ------------------------------------------------------------------ #
        # 3. Edit the comment (PUT — author-only enforcement)
        # ------------------------------------------------------------------ #
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"comment_lifecycle edit: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )

        # ------------------------------------------------------------------ #
        # 4. Delete the comment (DELETE — author-only enforcement)
        # ------------------------------------------------------------------ #
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"comment_lifecycle delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )
