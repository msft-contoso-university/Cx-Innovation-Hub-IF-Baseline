"""
Scenario: API Mutation Flow

Simulates creating and updating a project, task, and comment, then cleans up
the task and comment. Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

from locust import task

try:
    from .base import TaskifyBaseUser, STATUS_CYCLE
except ImportError:
    from base import TaskifyBaseUser, STATUS_CYCLE


class ApiMutationUser(TaskifyBaseUser):
    """User that exercises the API's create, update, and delete paths."""

    weight = 1

    def _failed(self, response, operation):
        if response.status_code < 200 or response.status_code >= 300:
            response.failure(f"{operation}: status {response.status_code}")
            return True
        if response.elapsed.total_seconds() * 1000 > 1000:
            response.failure(
                f"{operation}: response time "
                f"{response.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
            )
            return True
        return False

    @task
    def mutation_flow(self):
        """Create resources, exercise their mutation endpoints, and clean up."""
        project_id = None
        task_id = None
        comment_id = None
        sequence = getattr(self, "_mutation_sequence", 0) + 1
        self._mutation_sequence = sequence

        with self.client.post(
            "/api/projects",
            json={"name": f"Load test project {self.current_user_id}-{sequence}"},
            name="POST /api/projects",
            catch_response=True,
        ) as response:
            if self._failed(response, "mutation project create"):
                return
            project_id = response.json().get("id")

        if not project_id:
            return

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": f"Load test task {sequence}", "description": "Performance test"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as response:
            if self._failed(response, "mutation task create"):
                return
            task_id = response.json().get("id")

        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"Updated load test task {sequence}", "description": "Updated"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as response:
            if self._failed(response, "mutation task update"):
                return

        with self.client.patch(
            f"/api/tasks/{task_id}/status",
            json={"status": STATUS_CYCLE[1], "position": 0},
            name="PATCH /api/tasks/:id/status",
            catch_response=True,
        ) as response:
            if self._failed(response, "mutation task status"):
                return

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": self.current_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as response:
            if self._failed(response, "mutation task assignment"):
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Performance test comment"},
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as response:
            if self._failed(response, "mutation comment create"):
                return
            comment_id = response.json().get("id")

        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Updated performance test comment"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as response:
            if self._failed(response, "mutation comment update"):
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as response:
            if self._failed(response, "mutation comment delete"):
                return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as response:
            self._failed(response, "mutation task delete")
