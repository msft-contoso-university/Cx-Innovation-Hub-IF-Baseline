"""
Scenario: Project Mutations

Simulates creating new projects.
Covers: POST /api/projects.
Threshold: POST p95 < 1000 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class ProjectMutationsUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1

    @task
    def create_project(self):
        """Create a new project with a unique name."""
        unique_id = uuid.uuid4().hex[:8]
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Load Test Project {unique_id}",
                "description": "Created during performance testing.",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time "
                    f"{resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
