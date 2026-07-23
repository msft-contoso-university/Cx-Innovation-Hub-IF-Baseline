"""
Scenario: Task Lifecycle

Simulates creating, updating, assigning, and deleting a task in an existing
project. Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises the task mutation lifecycle."""

    weight = 2

    @task
    def manage_task_lifecycle(self):
        """Create, update, assign, and delete a task."""
        if not self.projects:
            return

        project_id = self.projects[0].get("id", self.projects[0].get("_id"))
        assignee_id = self.users[0].get("id", self.users[0].get("_id")) if self.users else None
        created_task_id = None

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Performance task for {self.current_user_id}",
                "description": "Task created by the Locust task lifecycle scenario.",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"manage_task_lifecycle create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"manage_task_lifecycle create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_task = resp.json()
            created_task_id = created_task.get("id", created_task.get("_id"))

        try:
            with self.client.put(
                f"/api/tasks/{created_task_id}",
                json={
                    "title": f"Updated performance task for {self.current_user_id}",
                    "description": "Task updated by the Locust task lifecycle scenario.",
                },
                name="PUT /api/tasks/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"manage_task_lifecycle update: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"manage_task_lifecycle update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

            with self.client.patch(
                f"/api/tasks/{created_task_id}/assign",
                json={"assigned_user_id": assignee_id},
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"manage_task_lifecycle assign: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"manage_task_lifecycle assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
        finally:
            if not created_task_id:
                return
            with self.client.delete(
                f"/api/tasks/{created_task_id}",
                name="DELETE /api/tasks/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"manage_task_lifecycle delete: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"manage_task_lifecycle delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
