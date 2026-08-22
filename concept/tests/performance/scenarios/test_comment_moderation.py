"""
Scenario: Comment Moderation

Simulates a comment author editing and then deleting their own comment,
exercising the ownership checks on the comment mutation endpoints.
Thresholds: GET p95 < 500 ms, POST/PUT/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class CommentModerationUser(TaskifyBaseUser):
    """User that edits and deletes their own comments."""

    weight = 2

    @task
    def comment_moderation(self):
        """Post a comment, edit it, then delete it as the same author."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[moderation] GET /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Create a comment owned by the current user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Perf moderation comment {uuid.uuid4().hex[:8]}"},
            headers={"X-User-Id": self.current_user_id},
            name="[moderation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_moderation create: status {resp.status_code}")
                return
            created = resp.json()

        comment_id = created.get("id", created.get("_id"))
        if comment_id is None:
            return

        # Edit the comment (author-only path)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"Perf moderation comment edited {uuid.uuid4().hex[:8]}"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_moderation edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment so the dataset stays stable across runs
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_moderation delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
