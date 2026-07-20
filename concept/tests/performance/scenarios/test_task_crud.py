"""
Scenario: Task CRUD Flow

Simulates a user creating a project, adding a task, updating it, assigning a
team member, and finally deleting the task.  Covers write endpoints that are
not exercised by the read-heavy scenarios.

Endpoints covered:
  POST   /api/projects
  POST   /api/projects/:id/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Implement feature flag",
    "Write release notes",
    "Update dependencies",
    "Fix flaky test",
    "Add error handling",
    "Review pull request",
    "Deploy to staging",
    "Update documentation",
]

PROJECT_NAMES = [
    "Load Test Project Alpha",
    "Load Test Project Beta",
    "Load Test Project Gamma",
    "Load Test Project Delta",
]


class TaskCrudUser(TaskifyBaseUser):
    """User that creates, updates, assigns, and deletes tasks."""

    weight = 2

    @task
    def task_crud_flow(self):
        """Create a project and task, update it, assign a user, then delete the task."""
        # ------------------------------------------------------------------
        # Step 1: Create a project
        # ------------------------------------------------------------------
        project_name = random.choice(PROJECT_NAMES)
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Performance test project"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))

        # ------------------------------------------------------------------
        # Step 2: Create a task in the project
        # ------------------------------------------------------------------
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": random.choice(TASK_TITLES), "description": "Created by load test"},
            name="POST /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_data = resp.json()

        task_id = task_data.get("id", task_data.get("_id"))

        # ------------------------------------------------------------------
        # Step 3: Update the task title and description
        # ------------------------------------------------------------------
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"{random.choice(TASK_TITLES)} (updated)", "description": "Updated by load test"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ------------------------------------------------------------------
        # Step 4: Assign a random user to the task
        # ------------------------------------------------------------------
        if self.users:
            assigned_user = random.choice(self.users)
            assigned_user_id = str(assigned_user.get("id", assigned_user.get("_id")))
            with self.client.patch(
                f"/api/tasks/{task_id}/assign",
                json={"assigned_user_id": assigned_user_id},
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"assign_task: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        # ------------------------------------------------------------------
        # Step 5: Delete the task (clean up)
        # ------------------------------------------------------------------
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
