"""
Scenario: Write Operations Flow

Simulates high-risk write paths by creating project/task/comment resources,
then updating assignment/content and deleting created entities.
Thresholds: POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class WriteOperationsUser(TaskifyBaseUser):
    """User that exercises critical write endpoints end-to-end."""

    weight = 2

    @staticmethod
    def _is_slow(response, limit_ms=1000):
        return response.elapsed.total_seconds() * 1000 > limit_ms

    @task
    def write_operations_flow(self):
        """Create and mutate entities to cover missing write endpoints."""
        suffix = int(time.time() * 1000)

        project_id = None
        with self.client.post(
            "/api/projects",
            json={"name": f"Perf Project {suffix}", "description": "Performance coverage scenario"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"write_operations create_project: status {resp.status_code}")
                return
            if self._is_slow(resp):
                resp.failure(
                    f"write_operations create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        task_id = None
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": f"Perf Task {suffix}", "description": "Created by Locust scenario"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"write_operations create_task: status {resp.status_code}")
                return
            if self._is_slow(resp):
                resp.failure(
                    f"write_operations create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"Updated Perf Task {suffix}", "description": "Updated by Locust scenario"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"write_operations update_task: status {resp.status_code}")
                return
            if self._is_slow(resp):
                resp.failure(
                    f"write_operations update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        assigned_user_id = None
        if self.users:
            assigned_user_id = self.users[0].get("id", self.users[0].get("_id"))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"write_operations assign_task: status {resp.status_code}")
                return
            if self._is_slow(resp):
                resp.failure(
                    f"write_operations assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Perf comment {suffix}"},
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"write_operations create_comment: status {resp.status_code}")
                return
            if self._is_slow(resp):
                resp.failure(
                    f"write_operations create_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment_id = resp.json().get("id")

        if comment_id:
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": f"Updated perf comment {suffix}"},
                headers={"X-User-Id": self.current_user_id},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"write_operations update_comment: status {resp.status_code}")
                    return
                if self._is_slow(resp):
                    resp.failure(
                        f"write_operations update_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers={"X-User-Id": self.current_user_id},
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"write_operations delete_comment: status {resp.status_code}")
                    return
                if self._is_slow(resp):
                    resp.failure(
                        f"write_operations delete_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"write_operations delete_task: status {resp.status_code}")
            elif self._is_slow(resp):
                resp.failure(
                    f"write_operations delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
