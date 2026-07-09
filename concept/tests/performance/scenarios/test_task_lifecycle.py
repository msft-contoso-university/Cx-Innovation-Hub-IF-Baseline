"""
Scenario: Task Lifecycle

Simulates a user creating a task, editing it, reassigning it, and deleting it.
Covers write operations that are otherwise unrepresented in the performance suite.

Endpoints exercised:
  POST   /api/projects/:projectId/tasks
  PUT    /api/tasks/:id
  PATCH  /api/tasks/:id/assign
  DELETE /api/tasks/:id

Thresholds: POST/PUT/PATCH p95 < 1000 ms, DELETE p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

TASK_TITLES = [
    "Investigate flaky test on CI",
    "Refactor authentication module",
    "Add pagination to API responses",
    "Update Docker base images",
    "Write onboarding documentation",
    "Fix timezone handling in reports",
    "Improve search index performance",
    "Migrate legacy config to env vars",
]

TASK_DESCRIPTIONS = [
    "See Jira ticket for full details.",
    "Follow up from last sprint retro.",
    "Needed before the next release.",
    None,
]


class TaskLifecycleUser(TaskifyBaseUser):
    """User that creates, updates, reassigns, then deletes a task."""

    weight = 2

    @task
    def task_lifecycle(self):
        """Create a task, update it, reassign it, then delete it."""
        if not self.projects:
            return

        project = random.choice(self.projects)
        project_id = project.get("id", project.get("_id"))

        title = random.choice(TASK_TITLES) + f" [{uuid.uuid4().hex[:6]}]"
        description = random.choice(TASK_DESCRIPTIONS)

        # --- POST /api/projects/:projectId/tasks ---
        task_id = None
        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": title, "description": description},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        # --- PUT /api/tasks/:id ---
        updated_title = title + " (updated)"
        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": updated_title, "description": "Updated via perf test."},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- PATCH /api/tasks/:id/assign ---
        assigned_user_id = None
        if self.users:
            assigned_user_id = str(
                random.choice(self.users).get("id", random.choice(self.users).get("_id"))
            )
        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )

        # --- DELETE /api/tasks/:id ---
        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
