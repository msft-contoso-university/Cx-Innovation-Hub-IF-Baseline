"""
Scenario: Project and Comment Management

Simulates creating new projects and editing/deleting comments authored by
the current simulated user.
Thresholds: POST p95 < 1000 ms, PUT/DELETE p95 < 500 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_PREFIXES = [
    "Alpha",
    "Beta",
    "Gamma",
    "Delta",
    "Epsilon",
    "Zeta",
]

PROJECT_DESCRIPTIONS = [
    "Perf-test generated project.",
    "Temporary project for load testing.",
    None,
]

COMMENT_EDITS = [
    "Updated: looks good to me.",
    "Revised: needs another pass.",
    "Clarified: blocked by design.",
    "Amended: ready for review.",
]


def _rand_suffix() -> str:
    return "".join(random.choices(string.ascii_lowercase, k=5))


class ProjectCommentManagementUser(TaskifyBaseUser):
    """Simulates creating projects and managing comment content."""

    weight = 1

    @task(3)
    def create_project(self):
        """Create a new project via POST /api/projects."""
        name = f"{random.choice(PROJECT_PREFIXES)} Project [{_rand_suffix()}]"
        description = random.choice(PROJECT_DESCRIPTIONS)
        payload: dict = {"name": name}
        if description:
            payload["description"] = description

        with self.client.post(
            "/api/projects",
            json=payload,
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(2)
    def edit_own_comment(self):
        """Post a comment then immediately edit it via PUT /api/comments/:id."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Find a task to comment on
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-mgmt] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"edit_own_comment get tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Post a new comment as current user
        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Initial comment for edit test."},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-mgmt] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"edit_own_comment post: status {resp.status_code}")
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # Edit the comment — PUT /api/comments/:id
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(COMMENT_EDITS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"edit_own_comment put: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"edit_own_comment put: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )

    @task(1)
    def delete_own_comment(self):
        """Post a comment then immediately delete it via DELETE /api/comments/:id."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Find a task to comment on
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment-mgmt] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_own_comment get tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        # Post a comment to delete
        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Temporary comment — will be deleted."},
            headers={"X-User-Id": self.current_user_id},
            name="[comment-mgmt] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"delete_own_comment post: status {resp.status_code}")
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        # Delete the comment — DELETE /api/comments/:id
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_own_comment delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"delete_own_comment delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
