"""
Scenario: Mutation Lifecycle

Simulates create/update/assign/delete flows for projects, tasks, and comments.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationLifecycleUser(TaskifyBaseUser):
    """User that exercises high-risk write endpoints end-to-end."""

    weight = 2

    @task
    def mutation_lifecycle(self):
        """Create and mutate project/task/comment entities, then clean up."""
        if not self.users:
            return

        suffix = uuid.uuid4().hex[:8]
        created_task_id = None
        comment_id = None

        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {suffix}",
                "description": "Created by performance scenario",
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
        if not project_id:
            return

        assigned_user = random.choice(self.users)
        assigned_user_id = assigned_user.get("id", assigned_user.get("_id"))

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf Task {suffix}",
                "description": "Lifecycle mutation task",
                "assigned_user_id": assigned_user_id,
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
            task_obj = resp.json()

        created_task_id = task_obj.get("id", task_obj.get("_id"))
        if not created_task_id:
            return

        with self.client.put(
            f"/api/tasks/{created_task_id}",
            json={
                "title": f"Perf Task Updated {suffix}",
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

        with self.client.patch(
            f"/api/tasks/{created_task_id}/assign",
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
            f"/api/tasks/{created_task_id}/comments",
            json={"content": f"Perf comment {suffix}"},
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
        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"Edited perf comment {suffix}"},
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
            f"/api/tasks/{created_task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"mutation_lifecycle delete task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_lifecycle delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
