"""
Scenario: Project Creation

Simulates a user creating a new project via the POST /api/projects endpoint.
Thresholds: POST p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


def _random_name(prefix: str = "Perf Project") -> str:
    suffix = "".join(random.choices(string.ascii_letters + string.digits, k=6))
    return f"{prefix} {suffix}"


class ProjectCreateUser(TaskifyBaseUser):
    """User that creates new projects to exercise the POST /api/projects endpoint."""

    weight = 1

    @task
    def create_project(self):
        """Create a new project and verify the response."""
        payload = {
            "name": _random_name(),
            "description": "Automated performance test project",
        }

        with self.client.post(
            "/api/projects",
            json=payload,
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds() * 1000:.0f}ms > 1000ms"
                )
