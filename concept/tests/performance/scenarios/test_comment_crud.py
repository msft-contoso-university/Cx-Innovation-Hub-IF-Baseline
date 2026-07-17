"""
Scenario: Comment Edit and Delete

Simulates a user editing and deleting their own comments:
  - POST a comment (to get an owned comment id)
  - PUT  /api/comments/:id  — edit the comment
  - DELETE /api/comments/:id — delete the comment

Thresholds: PUT p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

INITIAL_COMMENTS = [
    "Initial perf-test comment.",
    "Load test: first pass.",
    "Performance scenario: comment lifecycle.",
]

EDITED_COMMENTS = [
    "Edited by performance test.",
    "Updated content — load test.",
    "Revised: performance scenario comment.",
]


class CommentCrudUser(TaskifyBaseUser):
    """User that creates, edits, and deletes their own comments."""

    weight = 1

    @task
    def comment_edit_delete_flow(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks to pick one
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_crud] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_crud tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # POST a new comment (the actor is our current_user_id)
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(INITIAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_crud] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_crud post: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))

        # --- PUT /api/comments/:id ---
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_crud edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_crud edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- DELETE /api/comments/:id ---
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_crud delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"comment_crud delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
