"""
Scenario: Project Management

Simulates a user creating new projects via the API.
Covers: POST /api/projects
Threshold: POST p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


def _random_name(prefix: str = "Perf-Project") -> str:
    """Generate a unique project name to avoid duplicate-key conflicts."""
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}-{suffix}"


class ProjectManagementUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1

    @task
    def create_project(self):
        """POST a new project and verify it is created."""
        payload = {
            "name": _random_name(),
            "description": "Created by Locust performance test.",
        }

        with self.client.post(
            "/api/projects",
            json=payload,
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
