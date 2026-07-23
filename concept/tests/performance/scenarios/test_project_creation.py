"""
Scenario: Project Creation

Simulates a user creating a project once per session to cover the project
creation pathway under load. Thresholds: POST p95 < 1000 ms.
"""

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class ProjectCreationUser(TaskifyBaseUser):
    """User that creates a project once per session."""

    weight = 1

    def on_start(self):
        super().on_start()
        self.project_created = False

    @task
    def create_project(self):
        """Create a project and then idle for the rest of the session."""
        if self.project_created:
            return

        payload = {
            "name": f"Performance project for {self.current_user_id}",
            "description": "Project created by the Locust project creation scenario.",
        }

        with self.client.post(
            "/api/projects",
            json=payload,
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        self.project_created = True
