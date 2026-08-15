"""
Scenario: Mutation Lifecycle

Simulates project creation plus task/comment mutation workflows.
Thresholds: GET p95 < 500 ms, POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationLifecycleUser(TaskifyBaseUser):
    """User that exercises write-heavy task and comment lifecycle APIs."""

    weight = 2

    @task(1)
    def create_project(self):
        """Create a project to cover project creation traffic."""
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {uuid.uuid4().hex[:8]}",
                "description": "Created by Locust mutation scenario",
            },
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

            try:
                project = resp.json()
                project_id = project.get("id", project.get("_id"))
                if project_id:
                    self.projects.append(project)
            except Exception:
                resp.failure("create_project: invalid JSON response")

    @task(3)
    def task_and_comment_lifecycle(self):
        """Create, update, assign, and delete tasks/comments."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        task_id = None
        comment_id = None

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf Task {uuid.uuid4().hex[:8]}",
                "description": "Created by Locust mutation lifecycle",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            try:
                task = resp.json()
            except Exception:
                resp.failure("task_lifecycle create task: invalid JSON response")
                return
            task_id = task.get("id", task.get("_id"))

        if not task_id:
            return

        assigned_user = None
        if self.users:
            user = random.choice(self.users)
            assigned_user = user.get("id", user.get("_id"))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated Perf Task {uuid.uuid4().hex[:8]}",
                "description": "Updated by Locust mutation lifecycle",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Perf comment {uuid.uuid4().hex[:8]}"},
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
            else:
                try:
                    comment = resp.json()
                    comment_id = comment.get("id", comment.get("_id"))
                except Exception:
                    resp.failure("task_lifecycle create comment: invalid JSON response")

        if comment_id:
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": f"Perf comment update {uuid.uuid4().hex[:8]}"},
                headers={"X-User-Id": self.current_user_id},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code < 200 or resp.status_code >= 300:
                    resp.failure(f"task_lifecycle update comment: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"task_lifecycle update comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers={"X-User-Id": self.current_user_id},
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code < 200 or resp.status_code >= 300:
                    resp.failure(f"task_lifecycle delete comment: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"task_lifecycle delete comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"task_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
