"""
Scenario: Task Lifecycle Mutations

Simulates task and comment lifecycle mutations to cover critical write/delete APIs.
Thresholds: POST/PATCH/PUT p95 < 1000 ms.
"""

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class TaskLifecycleMutationsUser(TaskifyBaseUser):
    """User that performs deterministic task/comment mutation operations."""

    weight = 2

    @staticmethod
    def _is_slow(resp, threshold_ms):
        return resp.elapsed.total_seconds() * 1000 > threshold_ms

    @task
    def task_lifecycle_mutations(self):
        if not self.projects:
            return

        project_id = self.projects[0].get("id", self.projects[0].get("_id"))
        if project_id is None:
            return

        assigned_user_id = None
        if self.users:
            assigned_user_id = self.users[0].get("id", self.users[0].get("_id"))

        # Cover POST /api/projects
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Validation {project_id}",
                "description": "Coverage probe for mutation endpoints",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"create project: status {resp.status_code}")
            elif self._is_slow(resp, 1000):
                resp.failure(
                    f"create project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Cover POST /api/projects/:projectId/tasks
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf Task {project_id}",
                "description": "Lifecycle coverage task",
                "assigned_user_id": assigned_user_id,
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"create task: status {resp.status_code}")
                return
            if self._is_slow(resp, 1000):
                resp.failure(
                    f"create task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task = resp.json()

        task_id = task.get("id", task.get("_id"))
        if task_id is None:
            return

        # Cover PATCH /api/tasks/:id/assign
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"assign task: status {resp.status_code}")
                return
            if self._is_slow(resp, 1000):
                resp.failure(
                    f"assign task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        # Cover PUT /api/tasks/:id
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Perf Task Updated {task_id}",
                "description": "Updated by mutation scenario",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"update task: status {resp.status_code}")
                return
            if self._is_slow(resp, 1000):
                resp.failure(
                    f"update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        # Create comment to obtain id for comment edit/delete coverage
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Mutation coverage comment"},
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"create comment: status {resp.status_code}")
                return
            if self._is_slow(resp, 1000):
                resp.failure(
                    f"create comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if comment_id is None:
            return

        # Cover PUT /api/comments/:id
        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Mutation coverage comment (edited)"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"update comment: status {resp.status_code}")
                return
            if self._is_slow(resp, 1000):
                resp.failure(
                    f"update comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        # Cover DELETE /api/comments/:id
        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"delete comment: status {resp.status_code}")
                return
            if self._is_slow(resp, 1000):
                resp.failure(
                    f"delete comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        # Cover DELETE /api/tasks/:id
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"delete task: status {resp.status_code}")
            elif self._is_slow(resp, 1000):
                resp.failure(
                    f"delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
