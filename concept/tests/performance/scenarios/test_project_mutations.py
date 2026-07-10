"""
Scenario: Project Mutations

Simulates a user creating new projects.
Threshold: POST p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

ADJECTIVES = ["Fast", "Smart", "Bold", "Clean", "Sharp", "Swift", "Bright", "Solid"]
NOUNS = ["Tracker", "Dashboard", "Pipeline", "Platform", "Hub", "Suite", "Portal", "Toolkit"]


def _random_name() -> str:
    suffix = "".join(random.choices(string.ascii_lowercase, k=4))
    return f"{random.choice(ADJECTIVES)} {random.choice(NOUNS)} {suffix}"


class ProjectMutationsUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1

    @task
    def create_project(self):
        """POST a new project and verify it was created."""
        payload = {
            "name": _random_name(),
            "description": "Auto-generated load test project.",
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
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
