"""
Scenario: Comment Management Lifecycle

Simulates a user posting a comment on a task, editing it, then deleting it.
Covers: PUT /api/comments/:id, DELETE /api/comments/:id.
(POST /api/tasks/:taskId/comments is already covered by test_comments.py.)
Thresholds: GET p95 < 500 ms, POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

INITIAL_COMMENTS = [
    "Starting work on this item.",
    "Investigating the root cause.",
    "Drafted a first implementation.",
    "Will sync with the team tomorrow.",
    "Pausing — need more context.",
]

EDITED_COMMENTS = [
    "Updated after team review.",
    "Revised — see latest commit.",
    "Corrected my earlier assessment.",
    "New approach agreed in standup.",
    "Closed — issue was resolved upstream.",
]


class CommentManagementUser(TaskifyBaseUser):
    """User that posts, edits, and deletes their own comments."""

    weight = 2

    @task
    def comment_lifecycle(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks to pick one
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_mgmt] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_id = random.choice(tasks).get("id")
        if not task_id:
            return

        # --- Post a new comment (owned by self.current_user_id) ---
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(INITIAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_mgmt] POST /api/tasks/:taskId/comments",
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
            comment_data = resp.json()

        comment_id = comment_data.get("id", comment_data.get("_id"))
        if not comment_id:
            return

        # --- Edit the comment (author-only endpoint) ---
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle edit: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle edit: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Delete the comment (author-only endpoint) ---
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
