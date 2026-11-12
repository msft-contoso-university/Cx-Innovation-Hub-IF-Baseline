"""
Scenario: Project Management

Simulates a project lead creating new projects.
Thresholds: POST p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_NAME_PREFIXES = [
    "Platform Migration",
    "Customer Portal",
    "Mobile Revamp",
    "Data Pipeline",
    "Onboarding Flow",
]


class ProjectManagementUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1

    @task
    def create_project(self):
        """Create a new project with a unique name."""
        name = f"{random.choice(PROJECT_NAME_PREFIXES)} {uuid.uuid4().hex[:8]}"

        with self.client.post(
            "/api/projects",
            json={"name": name, "description": "Created by load test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
