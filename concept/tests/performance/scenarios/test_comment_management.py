"""
Scenario: Comment Management — Write Operations

Exercises the edit and delete lifecycle for task comments.
A comment is posted under the current user's identity, edited, and then
deleted to keep the database clean.

Endpoint coverage:
  PUT    /api/comments/:id
  DELETE /api/comments/:id

Thresholds: PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


INITIAL_COMMENTS = [
    "Investigating this issue.",
    "Added a first draft fix.",
    "Needs more context before proceeding.",
    "Working on it now — ETA tomorrow.",
    "LGTM after a quick review.",
    "Blocking on upstream dependency.",
    "Opened a follow-up ticket for this.",
    "Discussed in standup — moving forward.",
]

UPDATED_COMMENTS = [
    "Investigation complete — root cause identified.",
    "Fix confirmed and merged.",
    "Context added — ready to proceed.",
    "Implementation done — ready for review.",
    "All checks pass — closing.",
    "Unblocked — resuming work.",
    "Follow-up resolved.",
    "Standup decision applied.",
]


class CommentManagementUser(TaskifyBaseUser):
    """User that exercises the edit and delete lifecycle for comments."""

    weight = 1

    @task
    def comment_lifecycle(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks in the chosen project
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[mgmt] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_data = random.choice(tasks)
        task_id = task_data.get("id", task_data.get("_id"))

        # Post a new comment owned by the simulated user
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(INITIAL_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[mgmt] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_lifecycle post: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle post: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment_data = resp.json()

        comment_id = comment_data.get("id", comment_data.get("_id"))
        if not comment_id:
            return

        # Edit the comment (must use the same user who created it)
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(UPDATED_COMMENTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the comment to keep the database clean
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
                    f"comment_lifecycle delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
