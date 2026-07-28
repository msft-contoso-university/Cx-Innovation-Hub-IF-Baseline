"""
Scenario: Project Create

Simulates an admin user creating new projects to verify that the POST
endpoint handles write traffic correctly.
Threshold: POST p95 < 1000 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class ProjectCreateUser(TaskifyBaseUser):
    """User that creates new projects."""

    weight = 1

    @task
    def create_project(self):
        """Create a new project with a unique name."""
        project_name = f"Perf-Test-{uuid.uuid4().hex[:8]}"

        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by load test"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"create_project: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time "
                    f"{resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
            else:
                # Keep the project list fresh for other scenarios
                created = resp.json()
                project_id = created.get("id", created.get("_id"))
                if project_id:
                    self.projects.append(created)
