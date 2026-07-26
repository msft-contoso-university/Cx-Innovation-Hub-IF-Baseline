"""
Scenario: Project Management

Simulates a user creating new projects.  This is a low-frequency
write operation that exercises the POST /api/projects endpoint which
is absent from all other scenarios.

Threshold: POST p95 < 1500 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_PREFIXES = [
    "Load Test Project",
    "Perf Suite",
    "Automated Project",
    "Test Initiative",
    "Benchmark Run",
]

PROJECT_DESCRIPTIONS = [
    "Created automatically during performance testing.",
    "Temporary project for load test scenario coverage.",
    None,
]


class ProjectManagementUser(TaskifyBaseUser):
    """User that creates new projects to exercise the write path."""

    weight = 1

    @task
    def create_project(self):
        """Create a new project with a unique name."""
        import random

        name = f"{random.choice(PROJECT_PREFIXES)} [{uuid.uuid4().hex[:8]}]"
        description = random.choice(PROJECT_DESCRIPTIONS)

        with self.client.post(
            "/api/projects",
            json={"name": name, "description": description},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                if resp.elapsed.total_seconds() * 1000 > 1500:
                    resp.failure(
                        f"create_project: response time "
                        f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1500ms"
                    )
            else:
                resp.failure(f"create_project: status {resp.status_code}")
