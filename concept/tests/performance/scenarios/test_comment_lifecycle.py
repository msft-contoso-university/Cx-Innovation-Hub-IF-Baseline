"""
Scenario: Comment Lifecycle

Simulates a user posting a comment on a task, editing it, and then deleting it.

Endpoints exercised:
  POST   /api/tasks/:taskId/comments  (also covered by CommentActivityUser)
  PUT    /api/comments/:id
  DELETE /api/comments/:id

Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

INITIAL_COMMENTS = [
    "Starting work on this task.",
    "Investigating the root cause.",
    "Draft implementation complete.",
    "Waiting on design sign-off.",
    "Blocked — need clarification.",
]

EDITED_COMMENTS = [
    "Updated after review: looks good now.",
    "Revised — see linked PR for details.",
    "Edited for clarity.",
    "No longer blocked, moving forward.",
]


class CommentLifecycleUser(TaskifyBaseUser):
    """User that creates, edits, and deletes a comment on a task."""

    weight = 1

    @task
    def comment_lifecycle(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks for the project to find a target task
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_lifecycle] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # --- POST /api/tasks/:taskId/comments ---
        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(INITIAL_COMMENTS) + f" [{uuid.uuid4().hex[:6]}]"},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_lifecycle post: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle post: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # --- PUT /api/comments/:id ---
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle edit: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- DELETE /api/comments/:id ---
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
