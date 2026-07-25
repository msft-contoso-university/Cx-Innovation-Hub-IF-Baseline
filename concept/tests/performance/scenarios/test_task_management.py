"""
Scenario: Task Management Lifecycle

Simulates a user performing write operations on the Taskify API: creating a
project, creating a task, editing it, assigning a user, posting and editing a
comment, then cleaning up by deleting the comment and task.

Covers the following previously-untested endpoints:
  POST   /api/projects
  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id
  PUT    /api/comments/:id
  DELETE /api/comments/:id

Thresholds: GET p95 < 500 ms, POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


def _random_suffix(length: int = 6) -> str:
    """Return a short random alphanumeric string for unique name generation."""
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


TASK_TITLES = [
    "Implement feature",
    "Fix regression",
    "Write documentation",
    "Review pull request",
    "Update dependencies",
    "Add unit tests",
    "Refactor module",
    "Investigate bug",
]

TASK_UPDATES = [
    "Revised: more context added",
    "Updated: scope clarified",
    "Modified: acceptance criteria included",
]

COMMENT_TEXTS = [
    "Starting work on this.",
    "Blocked, need input from team.",
    "Almost done, final review pending.",
    "Merged to main.",
]

COMMENT_EDITS = [
    "Updated: additional detail added.",
    "Revised comment after discussion.",
    "Corrected after code review.",
]


class TaskManagementUser(TaskifyBaseUser):
    """User that exercises write endpoints: project/task/comment creation and deletion."""

    weight = 2

    @task
    def task_management_lifecycle(self):
        """
        Full write lifecycle:
          1. POST /api/projects             — create a project
          2. POST /api/projects/:id/tasks   — create a task
          3. PUT  /api/tasks/:id            — update task title/description
          4. PATCH /api/tasks/:id/assign    — assign a user to the task
          5. POST /api/tasks/:id/comments   — add a comment (reuses existing coverage)
          6. PUT  /api/comments/:id         — edit the comment
          7. DELETE /api/comments/:id       — remove the comment
          8. DELETE /api/tasks/:id          — delete the task
        """
        # ------------------------------------------------------------------
        # 1. Create a project
        # ------------------------------------------------------------------
        project_name = f"Perf-Project-{_random_suffix()}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by performance test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------
        # 2. Create a task in the project
        # ------------------------------------------------------------------
        task_title = random.choice(TASK_TITLES) + f" [{_random_suffix()}]"
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": "Initial description"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))

        # ------------------------------------------------------------------
        # 3. Update the task (PUT)
        # ------------------------------------------------------------------
        updated_title = random.choice(TASK_UPDATES) + f" [{_random_suffix()}]"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated description"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 4. Assign a user to the task (PATCH assign)
        # ------------------------------------------------------------------
        assigned_user_id = self.current_user_id
        if self.users:
            assigned_user_id = str(
                random.choice(self.users).get("id", self.current_user_id)
            )

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # 5. Post a comment on the task
        # ------------------------------------------------------------------
        comment_text = random.choice(COMMENT_TEXTS)
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": comment_text},
            headers={"X-User-Id": self.current_user_id},
            name="[lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"post_comment: status {resp.status_code}")
                # Continue to cleanup even if comment fails
                comment_id = None
            else:
                comment_id = resp.json().get("id")

        if comment_id is not None:
            # ------------------------------------------------------------------
            # 6. Edit the comment (PUT)
            # ------------------------------------------------------------------
            edited_text = random.choice(COMMENT_EDITS)
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": edited_text},
                headers={"X-User-Id": self.current_user_id},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"edit_comment: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"edit_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

            # ------------------------------------------------------------------
            # 7. Delete the comment
            # ------------------------------------------------------------------
            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers={"X-User-Id": self.current_user_id},
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"delete_comment: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"delete_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        # ------------------------------------------------------------------
        # 8. Delete the task
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
