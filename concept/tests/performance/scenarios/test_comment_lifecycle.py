"""
Scenario: Comment Lifecycle

Simulates a user posting a comment on a task, editing it, and then deleting
it. Exercises the comment mutation endpoints (edit/delete) not covered by
the read/post-only comment activity scenario.
Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class CommentLifecycleUser(TaskifyBaseUser):
    """User that posts a comment, edits it, then deletes it."""

    weight = 2

    @task
    def comment_lifecycle(self):
        """Post a comment on a random task, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

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

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Create a comment authored by the current simulated user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={
                "content": "Locust lifecycle comment",
                "user_id": int(self.current_user_id) if self.current_user_id.isdigit() else self.current_user_id,
            },
            headers={"X-User-Id": self.current_user_id},
            name="[comment-lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_lifecycle create: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        # Edit the comment (only the author, via X-User-Id, can succeed)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Locust lifecycle comment (edited)"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Clean up: delete the comment so it doesn't accumulate across runs
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
