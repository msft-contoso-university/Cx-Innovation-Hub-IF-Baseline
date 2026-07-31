"""
Scenario: Comment CRUD (Edit and Delete)

Simulates a user who posts a comment on a task and then either edits
or deletes it.  Exercises the write-path comment endpoints that were
previously missing from load-test coverage.

Endpoints exercised:
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
    "Initial thoughts — needs more context.",
    "Reviewed, minor nits to address.",
    "Blocked on design approval.",
    "Good to go after CI is green.",
    "Needs a second pair of eyes.",
]

EDITED_COMMENTS = [
    "Updated: context added — ready for merge.",
    "Revised: nits resolved.",
    "Unblocked — design approved.",
    "CI is now green, merging.",
    "Reviewed by second reviewer — LGTM.",
]


class CommentCrudUser(TaskifyBaseUser):
    """Simulates posting then editing or deleting a comment."""

    weight = 1

    def _get_task_id(self) -> str | None:
        """Return a random task ID from a random project, or None if unavailable."""
        if not self.projects:
            return None

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[setup] GET /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200 or not resp.json():
                return None
            tasks = resp.json()

        if not tasks:
            return None
        return str(random.choice(tasks).get("id", ""))

    @task(3)
    def edit_comment(self):
        """Post a comment then edit it: exercises PUT /api/comments/:id."""
        task_id = self._get_task_id()
        if not task_id:
            return

        # Post a new comment as the current user
        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(ORIGINAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[setup] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"edit_comment setup post: status {resp.status_code}")
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # Edit the comment
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"edit_comment put: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"edit_comment put: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(2)
    def delete_comment(self):
        """Post a comment then delete it: exercises DELETE /api/comments/:id."""
        task_id = self._get_task_id()
        if not task_id:
            return

        # Post a new comment as the current user
        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(ORIGINAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[setup] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"delete_comment setup post: status {resp.status_code}")
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

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
