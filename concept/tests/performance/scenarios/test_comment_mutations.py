"""
Scenario: Comment Mutations

Simulates a user creating a comment on a task, editing it, then deleting it.
Exercises two endpoints not covered by other scenarios:
  PUT    /api/comments/:id
  DELETE /api/comments/:id

The POST /api/tasks/:taskId/comments call acts as setup for the mutation steps.
Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

COMMENT_TEXTS = [
    "Draft note – will update shortly.",
    "Placeholder while we investigate.",
    "Quick update before the meeting.",
    "WIP — more details to follow.",
]

EDITED_TEXTS = [
    "Final note after review.",
    "Updated after investigation complete.",
    "Confirmed and closing.",
    "Done — no further action needed.",
]


class CommentMutationsUser(TaskifyBaseUser):
    """User that posts a comment, edits it, then deletes it."""

    weight = 1

    @task
    def comment_mutations(self):
        """Post a comment on a task then edit and delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------
        # Fetch tasks so we can pick a target task
        # ------------------------------------------------------------------
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[mutations] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutations tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_id = random.choice(tasks).get("id", random.choice(tasks).get("_id"))

        # ------------------------------------------------------------------
        # Create a comment to edit/delete
        # ------------------------------------------------------------------
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[mutations] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_mutations post: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))

        # ------------------------------------------------------------------
        # Edit the comment
        # ------------------------------------------------------------------
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutations edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mutations edit: response time {resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # Delete the comment (cleanup keeps data tidy under load)
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutations delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mutations delete: response time {resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
