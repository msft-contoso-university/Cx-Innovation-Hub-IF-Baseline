"""
Scenario: Work Item Management

Simulates a user creating a project workspace, managing tasks within it,
and moderating their own comments. Thresholds: write operations < 1000 ms.
"""

import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class WorkItemManagementUser(TaskifyBaseUser):
    """User that exercises uncovered project, task, and comment mutations."""

    weight = 2

    def on_start(self):
        """Initialize the scenario state for each virtual user."""
        super().on_start()
        self.managed_project_id = None

    def _fail_if_slow(self, resp, threshold_ms, action):
        """Mark a response as failed when it exceeds the scenario threshold."""
        elapsed_ms = resp.elapsed.total_seconds() * 1000
        if elapsed_ms > threshold_ms:
            resp.failure(
                f"{action}: response time {elapsed_ms:.0f}ms > {threshold_ms}ms"
            )
            return True
        return False

    def _ensure_project(self):
        """Create a dedicated project once per user session."""
        if self.managed_project_id:
            return self.managed_project_id

        payload = {
            "name": f"Perf Project {self.current_user_id}-{time.time_ns()}",
            "description": "Managed by Locust performance coverage scenario.",
        }

        with self.client.post(
            "/api/projects",
            json=payload,
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"ensure_project: status {resp.status_code}")
                return None
            if self._fail_if_slow(resp, 1000, "ensure_project"):
                return None
            project = resp.json()

        self.managed_project_id = project.get("id", project.get("_id"))
        return self.managed_project_id

    @task
    def manage_work_item_flow(self):
        """Create, update, assign, comment on, and delete a task."""
        if not self.users or not self.current_user_id:
            return

        project_id = self._ensure_project()
        if not project_id:
            return

        task_payload = {
            "title": f"Perf Task {time.time_ns()}",
            "description": "Created for mutation coverage.",
            "assigned_user_id": None,
        }

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json=task_payload,
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"manage_work_item_flow create task: status {resp.status_code}")
                return
            if self._fail_if_slow(resp, 1000, "manage_work_item_flow create task"):
                return
            task = resp.json()

        task_id = task.get("id", task.get("_id"))
        assignee = self.users[0]
        assignee_id = assignee.get("id", assignee.get("_id"))

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{task_payload['title']} Updated",
                "description": "Updated by Locust performance coverage scenario.",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"manage_work_item_flow update task: status {resp.status_code}")
                return
            if self._fail_if_slow(resp, 1000, "manage_work_item_flow update task"):
                return

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"manage_work_item_flow assign task: status {resp.status_code}")
                return
            if self._fail_if_slow(resp, 1000, "manage_work_item_flow assign task"):
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={
                "content": "Coverage comment from Locust.",
                "user_id": assignee_id,
            },
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"manage_work_item_flow create comment: status {resp.status_code}")
                return
            if self._fail_if_slow(resp, 1000, "manage_work_item_flow create comment"):
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Coverage comment updated by Locust."},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"manage_work_item_flow update comment: status {resp.status_code}")
                return
            if self._fail_if_slow(resp, 1000, "manage_work_item_flow update comment"):
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"manage_work_item_flow delete comment: status {resp.status_code}")
                return
            if self._fail_if_slow(resp, 1000, "manage_work_item_flow delete comment"):
                return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"manage_work_item_flow delete task: status {resp.status_code}")
                return
            self._fail_if_slow(resp, 1000, "manage_work_item_flow delete task")
