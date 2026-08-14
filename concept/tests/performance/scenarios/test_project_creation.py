"""
Scenario: Project Creation

Simulates an administrator creating a new project and immediately reading it
back from the project list.
Thresholds: POST p95 < 1000 ms, GET p95 < 500 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class ProjectAdminUser(TaskifyBaseUser):
    """User that creates projects — low weight because it writes new rows."""

    weight = 1

    @task
    def create_project(self):
        """Create a project with a unique name, then reload the project list."""
        unique_suffix = uuid.uuid4().hex[:8]

        with self.client.post(
            "/api/projects",
            json={
                "name": f"Load Test Project {unique_suffix}",
                "description": "Created by the Locust project creation scenario.",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created = resp.json()

        project_id = created.get("id", created.get("_id"))
        if not project_id:
            return

        with self.client.get(
            f"/api/projects/{project_id}",
            name="[admin] GET /api/projects/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"create_project read-back: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"create_project read-back: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
