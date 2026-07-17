"""
Scenario: Task CRUD Operations

Simulates a user performing full task lifecycle operations:
  - Create a project (POST /api/projects)
  - Create a task within a project (POST /api/projects/:projectId/tasks)
  - Update the task title/description (PUT /api/tasks/:id)
  - Assign a user to the task (PATCH /api/tasks/:id/assign)
  - Delete the task (DELETE /api/tasks/:id)

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 500 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_NAMES = [
    "Perf Test Project Alpha",
    "Perf Test Project Beta",
    "Perf Test Project Gamma",
    "Perf Test Project Delta",
]

TASK_TITLES = [
    "Load test task: initial setup",
    "Load test task: write unit tests",
    "Load test task: deploy to staging",
    "Load test task: review pull request",
    "Load test task: fix flaky test",
]

TASK_DESCRIPTIONS = [
    "Created by performance test run.",
    "Automated task for load testing.",
    None,
]


class TaskCrudUser(TaskifyBaseUser):
    """User that performs full task CRUD operations."""

    weight = 2

    @task
    def task_crud_flow(self):
        """Create a project, create a task, update it, assign a user, then delete it."""
        # --- POST /api/projects ---
        project_name = random.choice(PROJECT_NAMES)
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by perf test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_crud create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # --- POST /api/projects/:projectId/tasks ---
        task_title = random.choice(TASK_TITLES)
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": task_title,
                "description": random.choice(TASK_DESCRIPTIONS),
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_crud create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))

        # --- PUT /api/tasks/:id ---
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": task_title + " [updated]",
                "description": "Updated by perf test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_crud update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- PATCH /api/tasks/:id/assign ---
        assigned_user_id = None
        if self.users:
            user = random.choice(self.users)
            assigned_user_id = str(user.get("id", user.get("_id")))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_crud assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_crud assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- DELETE /api/tasks/:id ---
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_crud delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"task_crud delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
