"""
Scenario: Mutation Endpoint Coverage

Simulates write-heavy project/task/comment lifecycle calls to cover mutation endpoints.
Thresholds: POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

import random
import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationEndpointsUser(TaskifyBaseUser):
    """User that exercises project, task, and comment mutation endpoints."""

    weight = 2

    def on_start(self):
        super().on_start()
        self.created_project_id = None

        unique = int(time.time() * 1000)
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {unique}",
                "description": "Created by Locust mutation coverage scenario",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                project = resp.json()
                self.created_project_id = project.get("id", project.get("_id"))
            else:
                resp.failure(f"mutation_start create project: status {resp.status_code}")

    @task
    def mutation_lifecycle(self):
        """Create and mutate tasks/comments, then clean up task/comment resources."""
        project_id = self.created_project_id
        if not project_id and self.projects:
            project = random.choice(self.projects)
            project_id = project.get("id", project.get("_id"))

        if not project_id:
            return

        unique = int(time.time() * 1000)
        task_id = None

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf Task {unique}",
                "description": "Task for mutation coverage",
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
                "title": f"Perf Task Updated {unique}",
                "description": "Updated by mutation coverage scenario",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"mutation_lifecycle update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        assign_id = None
        if self.users:
            user = random.choice(self.users)
            assign_id = user.get("id", user.get("_id"))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assign_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"mutation_lifecycle assign task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle assign task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={
                "content": f"Mutation scenario comment {unique}",
                "user_id": int(self.current_user_id) if self.current_user_id.isdigit() else self.current_user_id,
            },
            headers={"X-User-Id": self.current_user_id},
            name="[mutation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                comment = resp.json()
                comment_id = comment.get("id", comment.get("_id"))
            else:
                resp.failure(f"mutation_lifecycle create comment: status {resp.status_code}")

        if comment_id:
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": f"Mutation scenario comment updated {unique}"},
                headers={"X-User-Id": self.current_user_id},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code < 200 or resp.status_code >= 300:
                    resp.failure(f"mutation_lifecycle update comment: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"mutation_lifecycle update comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers={"X-User-Id": self.current_user_id},
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code < 200 or resp.status_code >= 300:
                    resp.failure(f"mutation_lifecycle delete comment: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"mutation_lifecycle delete comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"mutation_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
