"""
Scenario: Task Lifecycle

Simulates creating, updating, assigning, commenting on, and deleting a task.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
from uuid import uuid4

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises task and comment mutation endpoints end to end."""

    weight = 3

    @task
    def task_lifecycle(self):
        """Create a task, mutate it, then clean it up."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))
        assignee = random.choice(self.users) if self.users else None
        task_id = None

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Perf Task {uuid4().hex[:8]}",
                "description": "Locust lifecycle coverage task.",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    "task_lifecycle create task: "
                    f"response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

            task = resp.json()
            task_id = task.get("id", task.get("_id"))

        if not task_id:
            return

        try:
            with self.client.put(
                f"/api/tasks/{task_id}",
                json={
                    "title": f"Perf Task Updated {uuid4().hex[:6]}",
                    "description": "Locust lifecycle coverage task updated.",
                },
                name="PUT /api/tasks/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"task_lifecycle update task: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        "task_lifecycle update task: "
                        f"response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

            with self.client.patch(
                f"/api/tasks/{task_id}/assign",
                json={
                    "assigned_user_id": (
                        assignee.get("id", assignee.get("_id")) if assignee else None
                    )
                },
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"task_lifecycle assign task: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        "task_lifecycle assign task: "
                        f"response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

            comment_id = None
            with self.client.post(
                f"/api/tasks/{task_id}/comments",
                json={"content": f"Locust comment {uuid4().hex[:8]}"},
                headers={"X-User-Id": self.current_user_id},
                name="POST /api/tasks/:taskId/comments",
                catch_response=True,
            ) as resp:
                if resp.status_code != 201:
                    resp.failure(f"task_lifecycle create comment: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        "task_lifecycle create comment: "
                        f"response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

                comment = resp.json()
                comment_id = comment.get("id", comment.get("_id"))

            if comment_id:
                with self.client.put(
                    f"/api/comments/{comment_id}",
                    json={"content": f"Locust comment updated {uuid4().hex[:8]}"},
                    headers={"X-User-Id": self.current_user_id},
                    name="PUT /api/comments/:id",
                    catch_response=True,
                ) as resp:
                    if resp.status_code != 200:
                        resp.failure(f"task_lifecycle update comment: status {resp.status_code}")
                        return
                    if resp.elapsed.total_seconds() * 1000 > 1000:
                        resp.failure(
                            "task_lifecycle update comment: "
                            f"response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                        )
                        return

                with self.client.delete(
                    f"/api/comments/{comment_id}",
                    headers={"X-User-Id": self.current_user_id},
                    name="DELETE /api/comments/:id",
                    catch_response=True,
                ) as resp:
                    if resp.status_code != 200:
                        resp.failure(f"task_lifecycle delete comment: status {resp.status_code}")
                        return
                    if resp.elapsed.total_seconds() * 1000 > 1000:
                        resp.failure(
                            "task_lifecycle delete comment: "
                            f"response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                        )
        finally:
            with self.client.delete(
                f"/api/tasks/{task_id}",
                name="DELETE /api/tasks/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"task_lifecycle delete task: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        "task_lifecycle delete task: "
                        f"response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
