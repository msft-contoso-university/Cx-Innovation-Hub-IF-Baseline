"""
Scenario: Comment Mutations

Simulates editing and deleting existing comments:
  - PUT    /api/comments/:id
  - DELETE /api/comments/:id

The virtual user posts a fresh comment, then edits it, then deletes it so the
operations stay scoped to data it owns and are safe to repeat at load.
Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDIT_TEXTS = [
    "Clarifying after offline discussion.",
    "Updated after reviewing the spec.",
    "Fixed a typo in my earlier comment.",
    "Adding more context based on team feedback.",
    "Revised — previous statement was incorrect.",
]


class CommentMutationsUser(TaskifyBaseUser):
    """User that edits and deletes their own comments."""

    weight = 1

    def _get_random_task_id(self) -> str | None:
        """Fetch tasks from a random project and return a task id."""
        if not self.projects:
            return None

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        resp = self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-mut] GET /api/projects/:id/tasks",
        )
        if resp.status_code != 200:
            return None
        tasks = resp.json()
        if not tasks:
            return None

        return str(random.choice(tasks).get("id", random.choice(tasks).get("_id")))

    def _post_comment(self, task_id: str) -> str | None:
        """POST a new comment to task_id and return its id."""
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Load test comment — will be edited."},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-mut] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"post_comment: status {resp.status_code}")
                return None
            data = resp.json()
            return str(data.get("id", data.get("_id", "")))

    @task(2)
    def edit_comment(self):
        """POST a comment then immediately PUT an edit to it."""
        task_id = self._get_random_task_id()
        if not task_id:
            return

        comment_id = self._post_comment(task_id)
        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
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

    @task(1)
    def delete_comment(self):
        """POST a comment then immediately DELETE it."""
        task_id = self._get_random_task_id()
        if not task_id:
            return

        comment_id = self._post_comment(task_id)
        if not comment_id:
            return

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
