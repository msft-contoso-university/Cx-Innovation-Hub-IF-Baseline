"""
Scenario: Comment Management

Simulates a user posting a comment on a task, editing it, and then deleting
it.  Covers the write/mutate endpoints on the comments resource that are not
exercised by the comment-activity scenario.

Endpoints covered:
  PUT    /api/comments/:id   — edit an existing comment
  DELETE /api/comments/:id   — delete a comment

(POST /api/tasks/:taskId/comments is already covered by CommentActivityUser;
it is included here only as the setup step needed to obtain a comment id.)

Thresholds: PUT p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

COMMENT_TEXTS = [
    "Initial comment from perf test.",
    "Placeholder — will be updated.",
    "Load test comment entry.",
    "Perf scenario seed comment.",
]

UPDATED_COMMENT_TEXTS = [
    "Edited by perf test — safe to delete.",
    "Updated during load test run.",
    "Comment content revised.",
]


class CommentManagementUser(TaskifyBaseUser):
    """User that posts, edits, and deletes task comments."""

    weight = 1

    @task
    def comment_lifecycle(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks so we have a task id to comment on
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-mgmt] GET /api/projects/:projectId/tasks",
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

        # --- POST (setup) -----------------------------------------------------
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-mgmt] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_lifecycle post: status {resp.status_code}")
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        # --- PUT --------------------------------------------------------------
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(UPDATED_COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_lifecycle edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment_lifecycle edit: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- DELETE -----------------------------------------------------------
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"comment_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"comment_lifecycle delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
