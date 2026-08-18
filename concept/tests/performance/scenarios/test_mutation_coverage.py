"""
Scenario: Mutation Endpoint Coverage

Simulates a user creating and mutating projects, tasks, and comments to
exercise write-heavy API paths. Thresholds: POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

import random
from uuid import uuid4

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationCoverageUser(TaskifyBaseUser):
    """User that executes create/update/assign/delete flows for key entities."""

    weight = 2

    @task
    def mutation_flow(self):
        """Create a project and task, mutate both task and comment data, then cleanup."""
        if not self.users:
            return

        project_id = None
        task_id = None
        comment_id = None

        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {uuid4().hex[:8]}",
                "description": "Temporary project for performance mutation coverage.",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"mutation_flow create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_flow create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        assigned_user = random.choice(self.users)
        assigned_user_id = assigned_user.get("id", assigned_user.get("_id"))

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf Task {uuid4().hex[:8]}",
                "description": "Temporary task for performance mutation coverage.",
                "assigned_user_id": assigned_user_id,
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"mutation_flow create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_flow create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated Perf Task {uuid4().hex[:6]}",
                "description": "Updated task description for mutation endpoint coverage.",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"mutation_flow update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_flow update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"mutation_flow assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_flow assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Temporary performance test comment"},
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"mutation_flow create_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_flow create_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
            else:
                comment_id = resp.json().get("id")

        if comment_id:
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": "Updated temporary performance test comment"},
                headers={"X-User-Id": self.current_user_id},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"mutation_flow update_comment: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"mutation_flow update_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers={"X-User-Id": self.current_user_id},
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"mutation_flow delete_comment: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"mutation_flow delete_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"mutation_flow delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_flow delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
