"""
Scenario: Task Lifecycle

Simulates the full task management lifecycle: creating a project, adding a
task to it, updating the task, assigning it to a user, and finally deleting
it. Exercises the mutation endpoints not covered by other scenarios.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


def _random_suffix(length=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates, updates, assigns, and deletes tasks/projects."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a project + task, update it, assign it, then delete it."""
        # Create a project to host the task
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Load Test Project {_random_suffix()}",
                "description": "Created by Locust task lifecycle scenario",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        # Create a task in the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Load Test Task {_random_suffix()}",
                "description": "Created by Locust task lifecycle scenario",
            },
            name="POST /api/projects/:id/tasks",
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
            task_obj = resp.json()

        task_id = task_obj.get("id", task_obj.get("_id"))
        if not task_id:
            return

        # Update the task's title/description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated Load Test Task {_random_suffix()}",
                "description": "Updated by Locust task lifecycle scenario",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Assign the task to the current simulated user
        assign_user_id = (
            int(self.current_user_id) if self.current_user_id.isdigit() else self.current_user_id
        )
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assign_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Clean up: delete the task so it doesn't accumulate across runs
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
