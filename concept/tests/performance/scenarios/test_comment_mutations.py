"""
Scenario: Comment Mutations

Simulates a user editing and deleting their own comments on tasks:
  - PUT    /api/comments/:id   (edit a comment)
  - DELETE /api/comments/:id   (delete a comment)

The scenario seeds its own comment via POST so the user always owns what they
edit/delete, keeping the flow realistic and self-contained.

Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

ORIGINAL_COMMENTS = [
    "Initial thoughts — needs more context.",
    "Placeholder until we have more info.",
    "Draft — will refine after standup.",
    "First pass, open to feedback.",
]

UPDATED_COMMENTS = [
    "Updated after review — looks good now.",
    "Revised with new requirements in mind.",
    "Clarified the acceptance criteria.",
    "Addressed all review comments.",
]


class CommentMutationsUser(TaskifyBaseUser):
    """User that posts, edits, and deletes comments on tasks."""

    weight = 2

    def _pick_task_id(self) -> str | None:
        """Return a random task id from the first available project."""
        if not self.projects:
            return None

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-mutations] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutations pick_task: status {resp.status_code}")
                return None
            tasks = resp.json()

        if not tasks:
            return None
        return random.choice(tasks).get("id", random.choice(tasks).get("_id"))

    def _post_comment(self, task_id: str) -> str | None:
        """POST /api/tasks/:taskId/comments — seed a comment; returns comment id."""
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(ORIGINAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-mutations] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_mutations seed: status {resp.status_code}")
                return None
            return resp.json().get("id")

    def _edit_comment(self, comment_id: str) -> None:
        """PUT /api/comments/:id — edit the comment."""
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(UPDATED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"edit_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"edit_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    def _delete_comment(self, comment_id: str) -> None:
        """DELETE /api/comments/:id — remove the comment."""
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task
    def comment_mutation_flow(self):
        """
        Post a comment, edit it, then delete it.
        Uses the same current_user_id throughout so ownership checks pass.
        """
        task_id = self._pick_task_id()
        if not task_id:
            return

        # Seed a comment this user owns
        comment_id = self._post_comment(task_id)
        if not comment_id:
            return

        # Edit the comment
        self._edit_comment(comment_id)

        # Clean up — delete the comment we created
        self._delete_comment(comment_id)
