"""
Scenario: Content Management

Simulates a user creating a project and managing comment lifecycle:
create a comment, edit it, then delete it.

Endpoints exercised (hook coverage):
  POST   /api/projects
  PUT    /api/comments/:id
  DELETE /api/comments/:id

Thresholds: POST p95 < 1000 ms, PUT/DELETE p95 < 500 ms.
"""

import random
import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_NAMES = [
    "Alpha Initiative",
    "Beta Rollout",
    "Gamma Upgrade",
    "Delta Migration",
    "Epsilon Refactor",
    "Zeta Launch",
]

COMMENT_TEXTS = [
    "Initial thoughts on this task.",
    "Need to revisit the acceptance criteria.",
    "Dependency resolved – unblocking this now.",
    "Added edge-case handling.",
    "Reviewed and approved.",
]

UPDATED_COMMENT_TEXTS = [
    "Updated: requirement clarified.",
    "Updated: added more context.",
    "Updated: corrected typo.",
    "Updated: linked design doc.",
]


class ContentManagementUser(TaskifyBaseUser):
    """User that creates projects and manages comment lifecycle."""

    weight = 2

    @task
    def create_project(self):
        """Create a new project with a unique timestamped name."""
        project_name = f"{random.choice(PROJECT_NAMES)} {int(time.time() * 1000) % 100000}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by perf test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task
    def comment_lifecycle(self):
        """Post a comment, edit it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks for the project to find a task id
        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[comment_lifecycle] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle tasks: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        task_obj = random.choice(tasks)
        task_id = task_obj.get("id", task_obj.get("_id"))

        # Create a comment
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": random.choice(COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="[comment_lifecycle] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment_lifecycle post: status {resp.status_code}")
                return
            comment_id = resp.json().get("id") or resp.json().get("_id")

        if not comment_id:
            return

        # --- PUT /api/comments/:id -----------------------------------------
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": random.choice(UPDATED_COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle edit: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"comment_lifecycle edit: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )

        # --- DELETE /api/comments/:id --------------------------------------
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"comment_lifecycle delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
