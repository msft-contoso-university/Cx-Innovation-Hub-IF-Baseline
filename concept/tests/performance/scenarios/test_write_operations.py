"""
Scenario: Write Operations Lifecycle

Simulates high-risk write flows: create project/task, update/assign task,
create/edit/delete comment, and delete task.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class WriteOperationsUser(TaskifyBaseUser):
    """User that exercises write-heavy API endpoints."""

    weight = 2

    def on_start(self):
        super().on_start()
        self._scenario_project_id = None

    @task
    def write_operations_lifecycle(self):
        """Run a deterministic write lifecycle against task and comment APIs."""
        if not self.current_user_id:
            return

        if not self._scenario_project_id:
            project_name = f"Locust Project {self.current_user_id}-{int(time.time() * 1000)}"
            with self.client.post(
                "/api/projects",
                json={"name": project_name, "description": "Locust coverage scenario"},
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
                self._scenario_project_id = resp.json().get("id")

        if not self._scenario_project_id:
            return

        assigned_user_id = None
        if self.users:
            assigned_user_id = self.users[0].get("id", self.users[0].get("_id"))

        with self.client.post(
            f"/api/projects/{self._scenario_project_id}/tasks",
            json={
                "title": f"Locust Task {int(time.time() * 1000)}",
                "description": "Created by write lifecycle scenario",
                "assigned_user_id": assigned_user_id,
            },
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
            task_id = resp.json().get("id")

        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": "Locust Updated Task", "description": "Updated during scenario"},
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
                return

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
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Locust comment lifecycle test"},
            headers={"X-User-Id": self.current_user_id},
            name="[write] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Locust edited comment"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

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
