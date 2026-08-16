"""
Scenario: Mutation Flows

Simulates users creating and updating disposable projects, tasks, and comments.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationFlowUser(TaskifyBaseUser):
    """User that exercises write-heavy API flows against disposable records."""

    weight = 1

    @task
    def mutation_flow(self):
        """Create and mutate disposable project, task, and comment records."""
        suffix = uuid.uuid4().hex[:8]
        project_id = self._create_project(suffix)
        if not project_id:
            return

        task_id = self._create_task(project_id, suffix)
        if not task_id:
            return

        self._update_task(task_id, suffix)
        self._assign_task(task_id)

        comment_id = self._create_comment(task_id, suffix)
        if comment_id:
            self._update_comment(comment_id, suffix)
            self._delete_comment(comment_id)

        self._delete_task(task_id)

    def _create_project(self, suffix):
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Load Test Project {suffix}",
                "description": "Created by Locust mutation flow.",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return None
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return None
            return resp.json().get("id")

    def _create_task(self, project_id, suffix):
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Load Test Task {suffix}",
                "description": "Created by Locust mutation flow.",
                "assigned_user_id": self.current_user_id,
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_task: status {resp.status_code}")
                return None
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return None
            return resp.json().get("id")

    def _update_task(self, task_id, suffix):
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated Load Test Task {suffix}",
                "description": "Updated by Locust mutation flow.",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    def _assign_task(self, task_id):
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": self.current_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    def _create_comment(self, task_id, suffix):
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Load test comment {suffix}"},
            headers={"X-User-Id": self.current_user_id},
            name="[mutation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_comment: status {resp.status_code}")
                return None
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return None
            return resp.json().get("id")

    def _update_comment(self, comment_id, suffix):
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"Updated load test comment {suffix}"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    def _delete_comment(self, comment_id):
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

    def _delete_task(self, task_id):
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
