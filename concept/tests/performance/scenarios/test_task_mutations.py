"""
Scenario: Task Mutations

Simulates a user performing write operations on tasks and projects:
  - POST /api/projects              (create project)
  - POST /api/projects/:id/tasks    (create task)
  - PUT  /api/tasks/:id             (update task title/description)
  - PATCH /api/tasks/:id/assign     (assign/unassign a user)
  - DELETE /api/tasks/:id           (delete a task)

Thresholds: GET p95 < 500 ms, POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Write unit tests",
    "Update documentation",
    "Fix regression bug",
    "Refactor data layer",
    "Add input validation",
    "Review pull request",
    "Deploy hotfix",
    "Sync with design team",
]

TASK_DESCRIPTIONS = [
    "Needs careful attention to edge cases.",
    "Follow the existing code style.",
    "Blocked pending upstream change.",
    None,
]


class TaskMutationsUser(TaskifyBaseUser):
    """User that creates, updates, assigns, and deletes tasks and projects."""

    weight = 2

    def _create_project(self) -> str | None:
        """POST /api/projects — returns new project id or None on failure."""
        name = f"Load-test project {uuid.uuid4().hex[:8]}"
        with self.client.post(
            "/api/projects",
            json={"name": name, "description": "Created by load test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return None
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return None
            return resp.json().get("id")

    def _create_task(self, project_id: str) -> str | None:
        """POST /api/projects/:id/tasks — returns new task id or None on failure."""
        title = random.choice(TASK_TITLES)
        description = random.choice(TASK_DESCRIPTIONS)
        payload: dict = {"title": title}
        if description:
            payload["description"] = description

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json=payload,
            name="POST /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_task: status {resp.status_code}")
                return None
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return None
            return resp.json().get("id")

    def _update_task(self, task_id: str) -> None:
        """PUT /api/tasks/:id — update title and description."""
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"Updated: {random.choice(TASK_TITLES)}",
                "description": "Updated by load test",
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

    def _assign_task(self, task_id: str) -> None:
        """PATCH /api/tasks/:id/assign — assign or unassign a user."""
        user_id = None
        if self.users:
            # Randomly assign or unassign
            if random.random() > 0.3:
                user = random.choice(self.users)
                user_id = user.get("id", user.get("_id"))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    def _delete_task(self, task_id: str) -> None:
        """DELETE /api/tasks/:id."""
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

    @task
    def task_mutation_flow(self):
        """
        Full write flow: create a project → create a task → update it →
        assign a user → delete it. This exercises all write-path endpoints
        in a realistic sequence while keeping the DB clean.
        """
        # Step 1: create a temporary project
        project_id = self._create_project()
        if not project_id:
            return

        # Step 2: create a task in that project
        task_id = self._create_task(project_id)
        if not task_id:
            return

        # Step 3: update the task
        self._update_task(task_id)

        # Step 4: assign a user to the task
        self._assign_task(task_id)

        # Step 5: clean up — delete the task we created
        self._delete_task(task_id)
