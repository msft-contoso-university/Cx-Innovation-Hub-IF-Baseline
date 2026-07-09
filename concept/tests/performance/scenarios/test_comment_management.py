"""
Scenario: Comment Management

Simulates a user editing and deleting their own comments:
  - Edit a comment the current user authored   PUT    /api/comments/:id
  - Delete a comment the current user authored DELETE /api/comments/:id

Only operates on comments where X-User-Id matches the author so that
ownership checks pass and the scenario stays deterministic.

Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDIT_TEXTS = [
    "Updated comment from Locust.",
    "Revised during performance test.",
    "Performance test edit — please ignore.",
    "Locust updated this comment.",
]


class CommentManagementUser(TaskifyBaseUser):
    """User that edits and deletes their own comments."""

    weight = 1

    def _get_own_comment_id(self, task_id: str) -> str | None:
        """Return the ID of a comment authored by the current simulated user, or None."""
        with self.client.get(
            f"/api/tasks/{task_id}/comments",
            name="[cm-setup] GET /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_management get comments: {resp.status_code}")
                return None
            comments = resp.json()

        own = [c for c in comments if str(c.get("user_id", "")) == str(self.current_user_id)]
        return str(own[0]["id"]) if own else None

    def _pick_task_id(self) -> str | None:
        """Return a random task ID from a random project, or None."""
        if not self.projects:
            return None
        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[cm-setup] GET /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200 or not resp.json():
                return None
            tasks = resp.json()
        return str(random.choice(tasks).get("id", "")) if tasks else None

    @task(2)
    def edit_own_comment(self):
        """POST a comment then immediately edit it via PUT /api/comments/:id."""
        task_id = self._pick_task_id()
        if not task_id:
            return

        # Create a comment so we own it
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Locust comment to be edited."},
            headers={"X-User-Id": self.current_user_id},
            name="[cm-setup] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"comment_management post: {resp.status_code}")
                return
            comment_id = str(resp.json().get("id", ""))

        if not comment_id:
            return

        # Edit it
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_management edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_management edit: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(1)
    def delete_own_comment(self):
        """POST a comment then immediately delete it via DELETE /api/comments/:id."""
        task_id = self._pick_task_id()
        if not task_id:
            return

        # Create a comment so we own it
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Locust comment to be deleted."},
            headers={"X-User-Id": self.current_user_id},
            name="[cm-setup] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"comment_management post for delete: {resp.status_code}")
                return
            comment_id = str(resp.json().get("id", ""))

        if not comment_id:
            return

        # Delete it
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_management delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_management delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
