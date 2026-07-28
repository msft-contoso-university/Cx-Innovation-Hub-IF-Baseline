"""
Scenario: Comment Edit and Delete

Simulates a user editing their own comment and then deleting it.
This exercises the PUT and DELETE paths that enforce author-only ownership.

Thresholds: PUT p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDIT_TEXTS = [
    "Corrected: updated implementation attached.",
    "Revised after peer review.",
    "Simplified the approach — cleaner now.",
    "Fixed the typo in the previous version.",
]


class CommentEditDeleteUser(TaskifyBaseUser):
    """User that edits and deletes their own comments."""

    weight = 1

    @task
    def comment_edit_delete(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks for the project
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_edit] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(
                    f"comment_edit_delete tasks: status {resp.status_code}"
                )
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Post a new comment (so we own it)
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Draft comment — will be edited."},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_edit] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(
                    f"comment_edit_delete create: status {resp.status_code}"
                )
                return
            comment_data = resp.json()
            comment_id = comment_data.get("id", comment_data.get("_id"))

        if not comment_id:
            return

        # Edit the comment
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(
                    f"comment_edit_delete edit: status {resp.status_code}"
                )
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_edit_delete edit: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(
                    f"comment_edit_delete delete: status {resp.status_code}"
                )
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_edit_delete delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
