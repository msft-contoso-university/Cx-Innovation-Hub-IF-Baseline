"""
Scenario: Comment Mutations

Simulates a user editing and deleting their own comments:
  - Post a comment on a task (already covered by CommentActivityUser,
    but needed here so the user owns the comment to edit/delete)
  - Edit the comment (PUT /api/comments/:id)
  - Delete the comment (DELETE /api/comments/:id)

Comment ownership is enforced server-side via the X-User-Id header set
by the base class during on_start.  Only the author can edit or delete.

Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

COMMENT_TEXTS = [
    "Starting work on this task.",
    "Blocked — waiting for design sign-off.",
    "PR raised, ready for review.",
    "Added unit tests as requested.",
    "Fixed edge case found during QA.",
]

EDITED_TEXTS = [
    "Updated: blocked issue resolved.",
    "Edited: implementation details added.",
    "Correction: wrong ticket referenced earlier.",
]


class CommentMutationsUser(TaskifyBaseUser):
    """User that posts, edits, and deletes their own task comments."""

    weight = 1

    @task
    def comment_mutation_flow(self):
        """Post a comment, edit it, then delete it — all as the same user."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # ── Fetch tasks for the project ────────────────────────────────────────
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_mut] GET /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutation tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # ── Post a new comment ─────────────────────────────────────────────────
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_mut] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_mutation post: status {resp.status_code}")
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # ── Edit the comment (author only) ─────────────────────────────────────
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutation edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mutation edit: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Delete the comment (author only) ───────────────────────────────────
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutation delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mutation delete: {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
