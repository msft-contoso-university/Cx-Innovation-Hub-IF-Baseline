"""
Scenario: Project Creation

Simulates an occasional user creating a new project board and immediately
opening it.  Kept at a low weight because created projects are persistent.
Thresholds: POST p95 < 1000 ms, GET p95 < 500 ms.
"""

import uuid

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class ProjectCreationUser(TaskifyBaseUser):
    """User that creates a project and loads its detail view."""

    weight = 1

    @task
    def create_project(self):
        """Create a project, then fetch it back."""
        suffix = uuid.uuid4().hex[:8]

        with self.client.post(
            "/api/projects",
            json={
                "name": f"Perf Project {suffix}",
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
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        with self.client.get(
            f"/api/projects/{project_id}",
            name="[create-project] GET /api/projects/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"create_project fetch: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"create_project fetch: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
