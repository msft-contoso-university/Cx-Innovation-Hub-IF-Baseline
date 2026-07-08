"""
Scenario: Comment Edit and Delete Operations

Simulates a user posting a comment, editing it, then deleting it.
Uses X-User-Id header for author-only operations so that the PUT and
DELETE ownership checks are exercised under load.

Covers:
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
    "Updated: after further review, this looks good.",
    "Revised: added more context for the team.",
    "Corrected: fixing a typo in the original comment.",
    "Amended: changed recommendation based on new info.",
    "Clarified: this applies only to the web client.",
]


class CommentCrudUser(TaskifyBaseUser):
    """User that posts, edits, and deletes their own comments."""

    weight = 1

    @task
    def comment_edit_delete(self):
        """Post a comment, edit it, then delete it as the same user."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks so we have a valid task id
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_crud] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_edit_delete get tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_obj = random.choice(tasks)
        task_id = task_obj.get("id", task_obj.get("_id"))

        # Post a new comment owned by the current simulated user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Load test comment — will be edited and deleted."},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_crud] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_edit_delete post comment: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))

        # Edit the comment (author-only endpoint)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_edit_delete edit comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_edit_delete edit comment: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment (author-only endpoint, clean up)
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_edit_delete delete comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_edit_delete delete comment: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
