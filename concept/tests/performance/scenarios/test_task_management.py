"""
Scenario: Task Management (Create, Update, Assign, Delete)

Simulates a power user who creates a project, adds tasks, updates them,
assigns team members, and cleans up.  This covers the write-heavy API
endpoints that were previously untested by load tests.

Endpoints exercised:
  POST /api/projects
  POST /api/projects/:projectId/tasks
  PUT  /api/tasks/:id
  PATCH /api/tasks/:id/assign
  DELETE /api/tasks/:id
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


TASK_TITLES = [
    "Implement login flow",
    "Write unit tests",
    "Fix pagination bug",
    "Update API docs",
    "Code review sprint items",
    "Refactor database queries",
    "Add error logging",
    "Deploy to staging",
]

TASK_DESCRIPTIONS = [
    "Needs design sign-off before starting.",
    "Cover happy-path and edge-cases.",
    "Reproducible on Chrome and Firefox.",
    "Reference internal wiki for standards.",
    None,
]


def _rand_suffix(n: int = 6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


class TaskManagementUser(TaskifyBaseUser):
    """Simulates create / update / assign / delete lifecycle for tasks."""

    weight = 2

    @task
    def task_management_flow(self):
        """
        Full task lifecycle:
          1. Create a project (or reuse an existing one)
          2. Create a task in that project
          3. Update the task title/description
          4. Assign the task to a random user
          5. Delete the task
        """
        # ── Step 1: get or create a project ───────────────────────────────
        if self.projects:
            project = random.choice(self.projects)
            project_id = project.get("id", project.get("_id"))
        else:
            with self.client.post(
                "/api/projects",
                json={
                    "name": f"Perf Project {_rand_suffix()}",
                    "description": "Auto-created by load test",
                },
                name="POST /api/projects",
                catch_response=True,
            ) as resp:
                if resp.status_code != 201:
                    resp.failure(f"create_project: status {resp.status_code}")
                    return
                project_id = resp.json().get("id")

        # ── Step 2: create a task ─────────────────────────────────────────
        task_title = random.choice(TASK_TITLES)
        task_id = None

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"{task_title} {_rand_suffix()}",
                "description": random.choice(TASK_DESCRIPTIONS),
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        # ── Step 3: update the task ───────────────────────────────────────
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{task_title} (updated) {_rand_suffix()}",
                "description": random.choice(TASK_DESCRIPTIONS),
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Step 4: assign the task ───────────────────────────────────────
        assigned_user_id = None
        if self.users:
            assigned_user_id = str(random.choice(self.users).get("id", ""))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # ── Step 5: delete the task ───────────────────────────────────────
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

    @task(1)
    def create_project(self):
        """Standalone project creation to exercise POST /api/projects."""
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Load Test Project {_rand_suffix()}",
                "description": "Created during performance test",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
