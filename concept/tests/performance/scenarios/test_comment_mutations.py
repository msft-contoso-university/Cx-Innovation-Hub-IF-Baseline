"""
Scenario: Comment Mutations

Simulates a user posting a comment then editing and deleting it.
Covers: PUT /api/comments/:id, DELETE /api/comments/:id.
Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

INITIAL_COMMENTS = [
    "Starting work on this.",
    "Blocked — needs design sign-off.",
    "Picked this up today.",
    "Almost done, just cleaning up.",
]

EDITED_COMMENTS = [
    "Updated: resolved the blocker.",
    "Edited: merged upstream changes.",
    "Correction: see linked PR for context.",
    "Revised estimate: done by EOD.",
]


class CommentMutationsUser(TaskifyBaseUser):
    """User that posts a comment, edits it, then deletes it."""

    weight = 1

    @task
    def comment_mutation(self):
        """Post a comment on a task, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks to find a target task
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[mutation] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutation tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_id = random.choice(tasks).get("id") or random.choice(tasks).get("_id")

        # POST — create a comment
        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(INITIAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[mutation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_mutation post: status {resp.status_code}")
                return
            data = resp.json()
            comment_id = data.get("id", data.get("_id"))

        if not comment_id:
            return

        # PUT — edit the comment
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(EDITED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_mutation edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_mutation edit: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )

        # DELETE — remove the comment
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
                    f"comment_mutation delete: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
