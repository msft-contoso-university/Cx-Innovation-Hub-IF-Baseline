"""
Scenario: Comment Mutations

Simulates a user editing and deleting their own comments on a task.  Covers
the ownership-checked write-path endpoints for comments.
Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

COMMENT_TEXTS = [
    "Initial review notes added.",
    "Blocked pending design sign-off.",
    "Moving this to in-review.",
    "addressed the feedback.",
    "tests are passing now.",
    "Updated per PR comments.",
]

EDITED_TEXTS = [
    "Edited: addressed the review feedback.",
    "Edited: updated with latest findings.",
    "Edited: clarified the acceptance criteria.",
]


class CommentMutationsUser(TaskifyBaseUser):
    """User that creates, edits, and deletes comments to exercise ownership checks."""

    weight = 2

    @task
    def comment_mutation_lifecycle(self):
        """Post a comment then edit and delete it — exercises PUT and DELETE comment endpoints."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks for the project to find a task to comment on
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_mut] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mut tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # --- Step 1: POST a new comment (owned by current user) ---
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_mut] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"comment_mut post: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mut post: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment_data = resp.json()

        comment_id = comment_data.get("id", comment_data.get("_id"))
        if not comment_id:
            return

        # --- Step 2: PUT /api/comments/:id — edit the comment we just created ---
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mut edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mut edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Step 3: DELETE /api/comments/:id — clean up ---
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mut delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mut delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
