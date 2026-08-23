"""
Scenario: Project Creation

Simulates a manager creating a new project.
Thresholds: POST p95 < 1000 ms.
"""

import random

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_NAMES = [
    "Website Redesign",
    "Mobile App Launch",
    "Q3 Marketing Campaign",
    "Customer Portal Revamp",
    "Data Migration Initiative",
    "Internal Tooling Upgrade",
]


class ProjectCreationUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1

    @task
    def create_project(self):
        """Create a new project with a randomized name."""
        name = f"{random.choice(PROJECT_NAMES)} #{random.randint(1000, 9999)}"

        with self.client.post(
            "/api/projects",
            json={"name": name, "description": "Load-test generated project"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code < 200 or resp.status_code >= 300:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
