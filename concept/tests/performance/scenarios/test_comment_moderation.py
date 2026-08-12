"""
Scenario: Comment Moderation

Simulates a user posting a comment on a task, editing it, then deleting it.
Covers the author-only edit/delete authorization path.
Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class CommentModerationUser(TaskifyBaseUser):
    """User that posts, edits, then deletes their own comment."""

    weight = 1

    @task
    def moderate_own_comment(self):
        """Post a comment, edit it, then delete it as the authoring user."""
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
                resp.failure(f"moderate_own_comment tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Post a comment as the current simulated user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Initial note from load test."},
            headers={"X-User-Id": self.current_user_id},
            name="[moderation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"moderate_own_comment post: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if comment_id is None:
            return

        # Edit the comment as the same (authoring) user
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Updated note from load test."},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"moderate_own_comment edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"moderate_own_comment edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment as the same (authoring) user
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"moderate_own_comment delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"moderate_own_comment delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
