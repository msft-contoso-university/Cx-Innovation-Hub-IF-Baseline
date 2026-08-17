"""
Scenario: Project & Task Lifecycle

Simulates a user creating a project, adding a task to it, updating the task,
assigning it to a user, and finally deleting it. Exercises the full
create/update/delete lifecycle for projects and tasks.
Thresholds: GET p95 < 500 ms, POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_NAMES = [
    "Load Test Initiative",
    "Perf Rollout",
    "Kanban Expansion",
    "Backlog Grooming",
    "Release Readiness",
]

TASK_TITLES = [
    "Investigate latency spike",
    "Update onboarding docs",
    "Refactor comment thread UI",
    "Add retry logic to API client",
    "Review pull request backlog",
]


class ProjectTaskLifecycleUser(TaskifyBaseUser):
    """User that creates, updates, assigns, and deletes a project's task."""

    weight = 3

    @task
    def project_task_lifecycle(self):
        """Create a project + task, update it, assign it, then delete it."""

        # Create a new project
        with self.client.post(
            "/api/projects",
            json={
                "name": f"{random.choice(PROJECT_NAMES)} #{random.randint(1000, 9999)}",
                "description": "Created by Locust load test",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"project_lifecycle create project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"project_lifecycle create project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        # Create a task within the new project
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": random.choice(TASK_TITLES),
                "description": "Created by Locust load test",
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"project_lifecycle create task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"project_lifecycle create task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_task = resp.json()

        task_id = created_task.get("id", created_task.get("_id"))
        if not task_id:
            return

        # Update the task's title/description
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": f"{random.choice(TASK_TITLES)} (updated)",
                "description": "Updated by Locust load test",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"project_lifecycle update task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"project_lifecycle update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # Assign the task to a random known user (if any exist)
        if self.users:
            assignee = random.choice(self.users)
            assignee_id = assignee.get("id", assignee.get("_id"))
            with self.client.patch(
                f"/api/tasks/{task_id}/assign",
                json={"assigned_user_id": assignee_id},
                name="PATCH /api/tasks/:id/assign",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"project_lifecycle assign task: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"project_lifecycle assign task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )

        # Clean up: delete the task
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"project_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"project_lifecycle delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
