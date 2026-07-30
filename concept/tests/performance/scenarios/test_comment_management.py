"""
Scenario: Comment Management

Simulates a user editing and deleting their own comments:
  PUT    /api/comments/:id   — edit a comment the simulated user authored
  DELETE /api/comments/:id   — delete a comment the simulated user authored

The scenario first fetches existing comments for a random task. If the
simulated user has no comments yet it falls back to posting one so there is
always something to edit / delete.

Thresholds: PUT/DELETE p95 < 1500 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDIT_TEXTS = [
    "Updated: see the latest spec document.",
    "Revised after standup discussion.",
    "Amended following code review feedback.",
    "Clarification added for the QA team.",
    "Minor wording fix.",
]

POST_TEXTS = [
    "Initial comment — pending further review.",
    "Placeholder comment added by load test.",
    "Will update once implementation is complete.",
]


class CommentManagementUser(TaskifyBaseUser):
    """User that edits and deletes their own comments."""

    weight = 1

    @task
    def comment_management(self):
        """Edit then delete a comment authored by the simulated user."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------ #
        # 1. Pick a task to work with
        # ------------------------------------------------------------------ #
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[cm] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_management tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # ------------------------------------------------------------------ #
        # 2. Find or create a comment owned by the current simulated user
        # ------------------------------------------------------------------ #
        comment_id = None

        with self.client.get(
            f"/api/tasks/{task_id}/comments",
            name="[cm] GET /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                comments = resp.json()
                own = [
                    c for c in comments
                    if str(c.get("user_id")) == str(self.current_user_id)
                ]
                if own:
                    comment_id = own[-1].get("id")

        if comment_id is None:
            # Post a comment we can then edit / delete
            with self.client.post(
                f"/api/tasks/{task_id}/comments",
                json={"content": random.choice(POST_TEXTS)},
                headers={"X-User-Id": self.current_user_id},
                name="[cm] POST /api/tasks/:taskId/comments",
                catch_response=True,
            ) as resp:
                if resp.status_code == 201:
                    comment_id = resp.json().get("id")
                else:
                    resp.failure(f"comment_management post: status {resp.status_code}")
                    return

        if comment_id is None:
            return

        # ------------------------------------------------------------------ #
        # 3. Edit the comment
        # ------------------------------------------------------------------ #
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDIT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_management edit: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"comment_management edit: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )

        # ------------------------------------------------------------------ #
        # 4. Delete the comment (cleanup)
        # ------------------------------------------------------------------ #
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_management delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1500:
                resp.failure(
                    f"comment_management delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                )
