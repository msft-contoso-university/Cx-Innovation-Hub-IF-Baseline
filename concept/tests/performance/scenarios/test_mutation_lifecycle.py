"""
Scenario: Mutation Lifecycle

Simulates create/update/assign/delete flows for projects, tasks, and comments.
Thresholds: GET p95 < 500 ms, POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationLifecycleUser(TaskifyBaseUser):
    """User that exercises high-risk mutation endpoints."""

    weight = 2

    @task
    def mutation_lifecycle(self):
        """Create, update, assign, and delete related resources."""
        project_id = None
        task_id = None
        comment_id = None

        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {random.randint(100000, 999999)}",
                "description": "Created by load test scenario",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"mutation_lifecycle create project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle create project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()
            project_id = project.get("id", project.get("_id"))

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf Task {random.randint(100000, 999999)}",
                "description": "Lifecycle scenario task",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"mutation_lifecycle create task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle create task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task = resp.json()
            task_id = task.get("id", task.get("_id"))

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Perf Task Updated {random.randint(100000, 999999)}",
                "description": "Updated by lifecycle scenario",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"mutation_lifecycle update task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
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
                resp.failure(f"mutation_lifecycle assign task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle assign task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Lifecycle comment", "user_id": self.current_user_id},
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"mutation_lifecycle create comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle create comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment = resp.json()
            comment_id = comment.get("id", comment.get("_id"))

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Lifecycle comment updated"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"mutation_lifecycle update comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle update comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"mutation_lifecycle delete comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle delete comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"mutation_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
