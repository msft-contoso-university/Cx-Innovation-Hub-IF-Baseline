"""
Scenario: Comment Management

Simulates a user editing and deleting their own comments.  Covers the
two write-path comment endpoints (PUT and DELETE) that require author
ownership, complementing the read/post flows already in test_comments.py.

Thresholds: PUT p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

EDIT_TEXTS = [
    "Updated: see latest design doc for context.",
    "Revised after team discussion.",
    "Correction: the previous note was outdated.",
    "Edited to reflect current sprint scope.",
]


class CommentManagementUser(TaskifyBaseUser):
    """User that posts a comment, edits it, then deletes it."""

    weight = 1

    @task
    def comment_management(self):
        """Create a comment, edit it, then delete it — full comment lifecycle."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Get tasks for the selected project (setup — not counted toward coverage)
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[mgmt] GET /api/projects/:projectId/tasks",
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

        # Create a comment to obtain a comment_id we own (setup step)
        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Perf test comment [{uuid.uuid4().hex[:6]}]"},
            headers={"X-User-Id": self.current_user_id},
            name="[mgmt] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                data = resp.json()
                comment_id = data.get("id", data.get("_id"))
            else:
                resp.failure(f"comment_management create: status {resp.status_code}")
                return

        if comment_id is None:
            return

        # --- Edit the comment we own ---
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
                    f"comment_management edit: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- Delete the comment we own ---
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
                    f"comment_management delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
