"""
Scenario: Task Management

Simulates a user creating tasks in a project, updating task details,
reassigning them to team members, and deleting completed tasks.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Investigate performance regression",
    "Write unit tests for auth module",
    "Update API documentation",
    "Fix flaky end-to-end test",
    "Refactor database query layer",
    "Add input validation to new endpoint",
    "Review PR for feature branch",
    "Deploy hotfix to staging",
]

TASK_DESCRIPTIONS = [
    "Needs attention before next sprint.",
    "Blocking downstream work.",
    "Low priority — pick up when bandwidth allows.",
    "Agreed in last standup.",
    None,
]


class TaskManagementUser(TaskifyBaseUser):
    """User that creates, edits, reassigns, and deletes tasks."""

    weight = 3

    @task(3)
    def create_and_delete_task(self):
        """Create a task in a project, then delete it to keep data clean."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        # Create a task
        title = random.choice(TASK_TITLES) + f" [{uuid.uuid4().hex[:6]}]"
        description = random.choice(TASK_DESCRIPTIONS)
        payload = {"title": title}
        if description:
            payload["description"] = description

        created_task_id = None
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json=payload,
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
            created_task_id = resp.json().get("id")

        if not created_task_id:
            return

        # Delete the task we just created
        with self.client.delete(
            f"/api/tasks/{created_task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

    @task(2)
    def update_task_details(self):
        """Fetch project tasks then update the title/description of a random one."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[task-mgmt] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task list: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen = random.choice(tasks)
        task_id = chosen.get("id", chosen.get("_id"))

        new_title = random.choice(TASK_TITLES) + f" [upd-{uuid.uuid4().hex[:4]}]"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": new_title, "description": random.choice(TASK_DESCRIPTIONS)},
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
    def assign_task_to_user(self):
        """Fetch project tasks then reassign a random task to a team member."""
        if not self.projects or not self.users:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[task-mgmt] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task list: status {resp.status_code}")
                return
            tasks = resp.json()

        if not tasks:
            return

        chosen = random.choice(tasks)
        task_id = chosen.get("id", chosen.get("_id"))
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
