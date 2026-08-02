"""
Scenario: Project Creation

Simulates users creating new projects, covering the POST /api/projects endpoint.
Thresholds: POST p95 < 1000 ms.
"""

import random
import string

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser

PROJECT_ADJECTIVES = [
    "Alpha", "Beta", "Gamma", "Delta", "Epsilon",
    "Phoenix", "Horizon", "Zenith", "Apex", "Nova",
    "Catalyst", "Momentum", "Synergy", "Pinnacle", "Vanguard",
]

PROJECT_NOUNS = [
    "Initiative", "Platform", "Framework", "Pipeline", "Dashboard",
    "Migration", "Integration", "Redesign", "Rollout", "Overhaul",
]


def _random_project_name() -> str:
    adj = random.choice(PROJECT_ADJECTIVES)
    noun = random.choice(PROJECT_NOUNS)
    suffix = "".join(random.choices(string.digits, k=4))
    return f"{adj} {noun} {suffix}"


class ProjectCreationUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1  # Low weight — write operation, should not overwhelm

    @task
    def create_project(self):
        """POST a new project and verify it is created successfully."""
        payload = {
            "name": _random_project_name(),
            "description": "Load-test generated project",
        }

        with self.client.post(
            "/api/projects",
            json=payload,
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: expected 201, got {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
