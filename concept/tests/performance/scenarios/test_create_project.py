"""
Scenario: Create Project

Simulates a user creating a new project from the project list view.
Thresholds: POST p95 < 1000 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class CreateProjectUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1

    @task
    def create_project(self):
        """Create a project with a unique name to avoid collisions."""
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {uuid.uuid4().hex[:8]}",
                "description": "Created by the create project performance scenario.",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
