"""
Scenario: Comment Mutations

Simulates a user editing and deleting their own comments.
Creates a comment via an existing task, edits it, then deletes it.
Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDIT_TEXTS = [
    "Updated: see latest design doc for context.",
    "Revised after team review — approach confirmed.",
    "Corrected estimate: 3 points, not 2.",
    "Added more detail after offline discussion.",
    "Simplified the description per feedback.",
]


class CommentMutationUser(TaskifyBaseUser):
    """User that creates, edits, then deletes a comment on a task."""

    weight = 1

    @task
    def comment_mutation_flow(self):
        """Post a comment on a task, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------
        # 1. Get tasks for the project to find a valid task_id
        # ------------------------------------------------------------------
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-mutation] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutation tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # ------------------------------------------------------------------
        # 2. Post a new comment (prerequisite — already covered by test_comments.py)
        # ------------------------------------------------------------------
        comment_id = None

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Load-test comment for mutation testing."},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-mutation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"comment_mutation create: status {resp.status_code}")
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # ------------------------------------------------------------------
        # 3. Edit the comment (author-only)
        # ------------------------------------------------------------------
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"comment_mutation edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mutation edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 4. Delete the comment (author-only)
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 204):
                resp.failure(f"comment_mutation delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mutation delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
