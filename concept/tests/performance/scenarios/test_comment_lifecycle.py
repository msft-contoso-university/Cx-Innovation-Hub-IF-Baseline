"""
Scenario: Comment Lifecycle

Simulates a user posting a comment on an existing task, editing it and then
deleting it.  Only the comment author may edit or delete, so the scenario
always operates on comments it created itself.
Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

WRITE_THRESHOLD_MS = 1000

COMMENT_TEXTS = [
    "Starting work on this now.",
    "Pushed a fix, please re-check.",
    "Adding context from the incident review.",
    "Following up after standup.",
]


class CommentLifecycleUser(TaskifyBaseUser):
    """User that creates, edits and deletes its own comments."""

    weight = 2

    def _check(self, resp, label, expected_status):
        """Mark the response failed when status or latency is out of budget."""
        if resp.status_code != expected_status:
            resp.failure(f"{label}: status {resp.status_code}")
            return False
        if resp.elapsed.total_seconds() * 1000 > WRITE_THRESHOLD_MS:
            resp.failure(
                f"{label}: response time {resp.elapsed.total_seconds()*1000:.0f}ms "
                f"> {WRITE_THRESHOLD_MS}ms"
            )
            return False
        return True

    @task
    def comment_lifecycle(self):
        """Post a comment on a task, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-lifecycle] GET /api/projects/:id/tasks",
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

        # Create a comment owned by the current simulated user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "comment_lifecycle create", 201):
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # Edit the comment (author-only path)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"{random.choice(COMMENT_TEXTS)} (edited)"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_lifecycle edit", 200)

        # Delete the comment so repeated iterations stay dataset-neutral
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_lifecycle delete", 200)
