"""
Scenario: Comment Activity

Simulates a user viewing comments on a task, posting a new comment,
editing it, and deleting it.
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

UPDATED_COMMENT_TEXTS = [
    "Looks good, moving forward. (edited)",
    "Need more details on this one. (edited)",
    "No longer blocked — resolved upstream. (edited)",
    "Marking as done. (edited)",
]


class CommentActivityUser(TaskifyBaseUser):
    """User that reads, posts, edits, and deletes comments."""

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
        comment_id = None
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
            else:
                comment_id = resp.json().get("id")

        if not comment_id:
            return

        # Edit the comment
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(UPDATED_COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_activity edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_activity edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment to keep the database tidy
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_activity delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_activity delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
