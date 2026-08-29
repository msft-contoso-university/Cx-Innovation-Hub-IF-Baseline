"""
Scenario: Task CRUD Lifecycle

Simulates a user creating a project, adding a task to it, updating the task,
reassigning it, and finally deleting it. Exercises the task/project write
paths that were previously missing load coverage.
Thresholds: GET p95 < 500 ms, POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class TaskCrudUser(TaskifyBaseUser):
    """User that exercises the full task/project write lifecycle."""

    weight = 2

    @task
    def task_crud_lifecycle(self):
        """Create a project and task, update/assign/delete the task."""
        # Create a project to host the task
        with self.client.post(
            "/api/projects",
            json={"name": f"Load Test Project {random.randint(1, 1_000_000)}"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_crud create project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud create project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if project_id is None:
            return

        # Create a task in the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": f"Load Test Task {random.randint(1, 1_000_000)}"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_crud create task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud create task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))
        if task_id is None:
            return

        # Update the task's title/description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated Load Test Task {random.randint(1, 1_000_000)}",
                "description": "Updated during load test.",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_crud update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Assign the task to a random known user (falls back to current user)
        assignee_id = self.current_user_id
        if self.users:
            candidate = random.choice(self.users)
            assignee_id = candidate.get("id", candidate.get("_id", assignee_id))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_crud assign task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud assign task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Delete the task to clean up
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_crud delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
