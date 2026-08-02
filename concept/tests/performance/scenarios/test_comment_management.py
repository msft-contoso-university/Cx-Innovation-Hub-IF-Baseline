"""
Scenario: Comment Management

Simulates a user editing and deleting their own comments on a task.
Covers the authenticated write-path comment endpoints.

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
    "Updated after review — see latest spec.",
    "Revised wording for clarity.",
    "Corrected per team feedback.",
    "Added more context for the implementation.",
    "Simplified the description.",
]


class CommentManagementUser(TaskifyBaseUser):
    """User that posts, edits, and deletes their own comments."""

    weight = 1

    @task
    def comment_management(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks for the project
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_mgmt] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_management tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_id = random.choice(tasks).get("id", random.choice(tasks).get("_id"))

        # Post a new comment
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Initial comment from load test"},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_mgmt] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_management post: status {resp.status_code}")
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # Edit the comment (author == self.current_user_id)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_management edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_management edit: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_management delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_management delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
