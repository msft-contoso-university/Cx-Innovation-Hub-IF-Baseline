"""
Scenario: Project Creation

Simulates a user creating a new project.

Endpoints exercised:
  POST /api/projects

Thresholds: POST p95 < 1000 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_DESCRIPTIONS = [
    "Created by automated performance test.",
    "Load test project — safe to delete.",
    None,
]


class ProjectCreateUser(TaskifyBaseUser):
    """User that creates new projects to exercise the POST /api/projects endpoint."""

    weight = 1

    @task
    def create_project(self):
        """POST a new project with a unique name."""
        import random

        name = f"Perf Test Project {uuid.uuid4().hex[:8]}"
        description = random.choice(PROJECT_DESCRIPTIONS)

        with self.client.post(
            "/api/projects",
            json={"name": name, "description": description},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
