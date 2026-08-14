"""
Scenario: Comment Moderation

Simulates a comment author editing and then deleting their own comment,
exercising the ownership-checked write paths on /api/comments/:id.
Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

MODERATION_TEXTS = [
    "Initial note from the moderation scenario.",
    "Draft comment pending review.",
    "Temporary comment for load testing.",
]


class CommentModerationUser(TaskifyBaseUser):
    """User that posts a comment then edits and deletes it."""

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
            name="[moderation] GET /api/projects/:id/tasks",
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

        headers = {"X-User-Id": self.current_user_id}

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(MODERATION_TEXTS)},
            headers=headers,
            name="[moderation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_moderation create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_moderation create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created = resp.json()

        comment_id = created.get("id", created.get("_id"))
        if not comment_id:
            return

        try:
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": "Edited by the Locust comment moderation scenario."},
                headers=headers,
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"comment_moderation edit: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"comment_moderation edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
        finally:
            # Always clean up so repeated runs do not grow the dataset
            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers=headers,
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"comment_moderation delete: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"comment_moderation delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
