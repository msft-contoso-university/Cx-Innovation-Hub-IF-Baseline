"""
Scenario: Project Creation

Simulates low-frequency project creation traffic for newly added boards.
Thresholds: POST p95 < 1000 ms.
"""

from uuid import uuid4

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class ProjectCreationUser(TaskifyBaseUser):
    """User that provisions new projects."""

    weight = 1

    @task
    def create_project(self):
        """Create a project with a unique name."""
        payload = {
            "name": f"Perf Project {uuid4().hex[:8]}",
            "description": "Locust coverage scenario for project creation.",
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

            created_project = resp.json()
            if created_project.get("id"):
                self.projects.append(created_project)
