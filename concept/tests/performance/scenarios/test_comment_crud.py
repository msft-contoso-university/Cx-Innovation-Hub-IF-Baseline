"""
Scenario: Comment CRUD Lifecycle

Simulates a user posting a comment on an existing task, editing it, and then
deleting it. `X-User-Id` is sent consistently for every request so the
author-only ownership check on edit/delete is exercised under load.
Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class CommentCrudUser(TaskifyBaseUser):
    """User that creates, edits, and deletes their own comments."""

    weight = 1

    @task
    def comment_crud_lifecycle(self):
        """Create a comment on a random task, then edit and delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_crud] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_crud tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Create the comment as the current user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Load test comment."},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_crud] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_crud create: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if comment_id is None:
            return

        # Edit the comment (author-only enforced via X-User-Id)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Updated load test comment."},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_crud edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_crud edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment to clean up
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_crud delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_crud delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
