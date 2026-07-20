"""
Scenario: Comment Activity

Simulates a user viewing comments on a task and posting a new comment.
A second task creates a comment then edits and deletes it, covering the
write-and-own lifecycle for PUT /api/comments/:id and DELETE /api/comments/:id.

Thresholds: GET p95 < 500 ms, POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

COMMENT_TEXTS = [
    "Looks good, moving forward.",
    "Need more details on this one.",
    "Blocked by upstream dependency.",
    "Ready for review.",
    "Updated the implementation.",
    "Can we discuss this in standup?",
    "LGTM!",
    "Added unit tests for this.",
]


class CommentActivityUser(TaskifyBaseUser):
    """User that reads and posts comments."""

    weight = 2

    @task
    def comment_activity(self):
        """View comments on a task then post a new comment."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Get tasks for the project to find a task id
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_activity tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Fetch existing comments
        with self.client.get(
            f"/api/tasks/{task_id}/comments",
            name="GET /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_activity list: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"comment_activity list: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
                return

        # Post a new comment
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={
                "content": random.choice(COMMENT_TEXTS),
                "user_id": int(self.current_user_id) if self.current_user_id.isdigit() else self.current_user_id,
            },
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_activity post: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_activity post: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task
    def comment_edit_delete_flow(self):
        """Create a comment as the current user, then edit and delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks for the project
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-edit] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_edit tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Create a comment owned by the current user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-edit] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"comment_edit create: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))

        # Edit the comment (author-only — uses the same X-User-Id)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(COMMENT_TEXTS) + " (edited)"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_edit update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_edit update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment (author-only — clean up)
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_edit delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_edit delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
