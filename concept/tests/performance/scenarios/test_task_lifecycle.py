"""
Scenario: Task & Comment Write Lifecycle

Simulates a power user creating a project, creating a task in it, assigning
and editing the task, deleting the task, and separately posting/editing/
deleting a comment. Exercises the full write-side CRUD surface that the
read-focused scenarios do not cover.
Thresholds: GET p95 < 500 ms, POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Investigate flaky test",
    "Update onboarding docs",
    "Refactor auth middleware",
    "Add pagination to reports",
    "Triage support ticket",
]

COMMENT_TEXTS = [
    "Kicking off this task.",
    "Assigning to myself for now.",
    "Draft comment for load testing.",
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises the full project/task/comment write lifecycle."""

    weight = 2

    def _request(self, method, path, *, name, threshold_ms, **kwargs):
        """Issue an HTTP request and enforce a p95 threshold inline.

        Returns the parsed JSON body on success, or None on failure.
        """
        with getattr(self.client, method)(
            path, name=name, catch_response=True, **kwargs
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"{name}: status {resp.status_code}")
                return None
            if resp.elapsed.total_seconds() * 1000 > threshold_ms:
                resp.failure(
                    f"{name}: response time {resp.elapsed.total_seconds() * 1000:.0f}ms > {threshold_ms}ms"
                )
                return None
            return resp.json()

    @task
    def task_write_lifecycle(self):
        """Create → assign → edit → delete a task within a freshly created project."""
        unique_suffix = f"{int(time.time() * 1000)}-{random.randint(0, 9999)}"

        project = self._request(
            "post",
            "/api/projects",
            name="POST /api/projects",
            threshold_ms=1000,
            json={
                "name": f"Load Test Project {unique_suffix}",
                "description": "Created by TaskLifecycleUser load test scenario.",
            },
        )
        if not project:
            return
        project_id = project.get("id", project.get("_id"))

        created_task = self._request(
            "post",
            f"/api/projects/{project_id}/tasks",
            name="POST /api/projects/:projectId/tasks",
            threshold_ms=1000,
            json={
                "title": random.choice(TASK_TITLES),
                "description": "Created by load test scenario.",
            },
        )
        if not created_task:
            return
        task_id = created_task.get("id", created_task.get("_id"))

        assignee_id = None
        if self.users:
            assignee_id = random.choice(self.users).get("id", random.choice(self.users).get("_id"))

        self._request(
            "patch",
            f"/api/tasks/{task_id}/assign",
            name="PATCH /api/tasks/:id/assign",
            threshold_ms=1000,
            json={"assigned_user_id": assignee_id},
        )

        self._request(
            "put",
            f"/api/tasks/{task_id}",
            name="PUT /api/tasks/:id",
            threshold_ms=1000,
            json={
                "title": f"{random.choice(TASK_TITLES)} (updated)",
                "description": "Updated by load test scenario.",
            },
        )

        self._request(
            "delete",
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            threshold_ms=1000,
        )

    @task
    def comment_write_lifecycle(self):
        """Post a comment on an existing task, then edit and delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        tasks = self._request(
            "get",
            f"/api/projects/{project_id}/tasks",
            name="[lifecycle] GET /api/projects/:id/tasks",
            threshold_ms=500,
        )
        if not tasks:
            return

        chosen_task = random.choice(tasks)
        task_id = chosen_task.get("id", chosen_task.get("_id"))

        created_comment = self._request(
            "post",
            f"/api/tasks/{task_id}/comments",
            name="[lifecycle] POST /api/tasks/:taskId/comments",
            threshold_ms=1000,
            json={"content": random.choice(COMMENT_TEXTS)},
            headers={"X-User-Id": self.current_user_id},
        )
        if not created_comment:
            return
        comment_id = created_comment.get("id", created_comment.get("_id"))

        self._request(
            "put",
            f"/api/comments/{comment_id}",
            name="PUT /api/comments/:id",
            threshold_ms=1000,
            json={"content": f"{random.choice(COMMENT_TEXTS)} (edited)"},
            headers={"X-User-Id": self.current_user_id},
        )

        self._request(
            "delete",
            f"/api/comments/{comment_id}",
            name="DELETE /api/comments/:id",
            threshold_ms=1000,
            headers={"X-User-Id": self.current_user_id},
        )
