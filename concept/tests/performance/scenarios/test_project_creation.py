"""
Scenario: Project Creation

Simulates a user creating new projects via the API.
Covers: POST /api/projects.
Thresholds: POST p95 < 1000 ms.
"""

import random
import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_DESCRIPTIONS = [
    "Internal tooling project.",
    "Customer-facing feature work.",
    "Infrastructure and DevOps initiative.",
    "Research and exploration spike.",
    "Compliance and security hardening.",
]


class ProjectCreationUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1

    @task
    def create_project(self):
        """Create a new project with a unique name."""
        # Use a short UUID suffix to avoid name collisions between virtual users
        name = f"Perf Test Project {uuid.uuid4().hex[:8]}"

        with self.client.post(
            "/api/projects",
            json={
                "name": name,
                "description": random.choice(PROJECT_DESCRIPTIONS),
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
