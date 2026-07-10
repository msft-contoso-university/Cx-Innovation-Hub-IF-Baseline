"""
Scenario: Task Mutations

Simulates create, update, assign, and delete operations on tasks:
  - POST /api/projects/:projectId/tasks
  - PUT  /api/tasks/:id
  - PATCH /api/tasks/:id/assign
  - DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 800 ms.
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
    "Fix pagination bug",
    "Write API documentation",
    "Add unit tests",
    "Refactor auth middleware",
    "Update database schema",
    "Review pull request",
    "Deploy to staging",
]

TASK_DESCRIPTIONS = [
    "High priority — blocks release.",
    "Carry-over from last sprint.",
    "Investigate root cause first.",
    None,
]


def _random_title() -> str:
    suffix = "".join(random.choices(string.ascii_lowercase, k=3))
    return f"{random.choice(TASK_TITLES)} ({suffix})"


class TaskMutationsUser(TaskifyBaseUser):
    """User that creates, edits, assigns, and deletes tasks."""

    weight = 2

    @task(3)
    def create_task(self):
        """POST a new task to a random project."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": _random_title(),
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
            # Stash for subsequent mutation tasks
            created = resp.json()
            self._last_created_task_id = str(created.get("id", created.get("_id", "")))

    @task(2)
    def update_task(self):
        """PUT an updated title/description to an existing task."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Fetch tasks to find an existing task id
        tasks_resp = self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[task-mut] GET /api/projects/:id/tasks",
        )
        if tasks_resp.status_code != 200:
            return
        tasks = tasks_resp.json()
        if not tasks:
            return

        task_id = random.choice(tasks).get("id", random.choice(tasks).get("_id"))

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": _random_title(),
                "description": random.choice(TASK_DESCRIPTIONS),
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(2)
    def assign_task(self):
        """PATCH assign/unassign a user on a random task."""
        if not self.projects or not self.users:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        tasks_resp = self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[task-mut] GET /api/projects/:id/tasks",
        )
        if tasks_resp.status_code != 200:
            return
        tasks = tasks_resp.json()
        if not tasks:
            return

        task_id = random.choice(tasks).get("id", random.choice(tasks).get("_id"))
        # Randomly assign a user or unassign (null)
        assigned = random.choice([None, random.choice(self.users).get("id")])

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(1)
    def delete_task(self):
        """DELETE a task that was just created by this virtual user."""
        task_id = getattr(self, "_last_created_task_id", None)
        if not task_id:
            return

        self._last_created_task_id = None

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 800:
                resp.failure(
                    f"delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 800ms"
                )
