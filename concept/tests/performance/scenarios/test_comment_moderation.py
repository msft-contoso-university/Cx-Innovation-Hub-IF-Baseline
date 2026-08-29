"""
Scenario: Comment Moderation

Simulates a user posting a comment on a task, editing it and then deleting it.
Only the author may edit or delete, so the scenario always operates on the
comment it just created with the same X-User-Id header.
Thresholds: POST/PUT/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

WRITE_THRESHOLD_MS = 1000


class CommentModerationUser(TaskifyBaseUser):
    """User that edits and removes their own comments."""

    weight = 2

    def _check(self, resp, label, expected=(200,)):
        """Fail the sample when status or latency is out of bounds."""
        if resp.status_code not in expected:
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
    def comment_moderation(self):
        """Post a comment, edit it, then delete it as the same author."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[moderation] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_moderation tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))
        run_id = uuid.uuid4().hex[:8]
        author_headers = {"X-User-Id": self.current_user_id}

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Moderation scenario comment {run_id}"},
            headers=author_headers,
            name="[moderation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if not self._check(resp, "comment_moderation post", expected=(201,)):
                return
            comment_id = resp.json().get("id")

        if comment_id is None:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"Edited moderation comment {run_id}"},
            headers=author_headers,
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_moderation edit")

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers=author_headers,
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            self._check(resp, "comment_moderation delete")
