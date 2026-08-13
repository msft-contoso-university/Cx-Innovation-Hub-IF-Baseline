"""
Scenario: Task Mutation Flow

Simulates a user creating project/task data, updating assignment and comments,
then deleting the owned records. Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

from uuid import uuid4

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class TaskMutationUser(TaskifyBaseUser):
    """User that exercises mutating task and comment endpoints."""

    weight = 2

    def _ensure_fast_mutation(self, resp, action):
        elapsed_ms = resp.elapsed.total_seconds() * 1000
        if elapsed_ms > 1000:
            resp.failure(f"{action}: response time {elapsed_ms:.0f}ms > 1000ms")
            return False
        return True

    @task
    def task_mutation_flow(self):
        """Create, update, comment on, and delete task data."""
        if not self.current_user_id:
            return

        run_id = uuid4().hex[:8]

        with self.client.post(
            "/api/projects",
            json={
                "name": f"Load Test Project {run_id}",
                "description": "Created by Locust mutation coverage",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_mutation project create: status {resp.status_code}")
                return
            if not self._ensure_fast_mutation(resp, "task_mutation project create"):
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Load test task {run_id}",
                "description": "Created for mutation endpoint coverage",
                "assigned_user_id": self.current_user_id,
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_mutation task create: status {resp.status_code}")
                return
            if not self._ensure_fast_mutation(resp, "task_mutation task create"):
                return
            task_record = resp.json()

        task_id = task_record.get("id", task_record.get("_id"))
        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated load test task {run_id}",
                "description": "Updated for mutation endpoint coverage",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_mutation task update: status {resp.status_code}")
                return
            if not self._ensure_fast_mutation(resp, "task_mutation task update"):
                return

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": self.current_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_mutation task assign: status {resp.status_code}")
                return
            if not self._ensure_fast_mutation(resp, "task_mutation task assign"):
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Load test comment {run_id}"},
            headers={"X-User-Id": self.current_user_id},
            name="[mutation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_mutation comment create: status {resp.status_code}")
                return
            if not self._ensure_fast_mutation(resp, "task_mutation comment create"):
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"Updated load test comment {run_id}"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_mutation comment update: status {resp.status_code}")
                return
            if not self._ensure_fast_mutation(resp, "task_mutation comment update"):
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_mutation comment delete: status {resp.status_code}")
                return
            if not self._ensure_fast_mutation(resp, "task_mutation comment delete"):
                return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_mutation task delete: status {resp.status_code}")
                return
            self._ensure_fast_mutation(resp, "task_mutation task delete")
