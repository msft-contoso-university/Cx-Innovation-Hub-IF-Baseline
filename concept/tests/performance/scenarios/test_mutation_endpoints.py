"""
Scenario: Mutation Endpoint Coverage

Simulates authenticated write-heavy operations across project, task, and comment
mutation endpoints to close load-test coverage gaps.
Thresholds: POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationEndpointsUser(TaskifyBaseUser):
    """User that exercises uncovered API mutation endpoints."""

    weight = 1

    def on_start(self):
        super().on_start()
        self.coverage_project_id = None

    def _ensure_coverage_project(self):
        if self.coverage_project_id:
            return True

        project_name = f"Perf Coverage Project {self.current_user_id}"
        with self.client.post(
            "/api/projects",
            json={
                "name": project_name,
                "description": "Performance coverage scenario project",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_project: status {resp.status_code}")
                return False
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return False

            payload = resp.json()
            self.coverage_project_id = payload.get("id", payload.get("_id"))
            return bool(self.coverage_project_id)

    @task
    def mutation_endpoint_flow(self):
        """Create/update/assign/delete task and edit/delete comment."""
        if not self._ensure_coverage_project():
            return

        project_id = self.coverage_project_id
        assignee = self.users[0] if self.users else {}
        assignee_id = assignee.get("id", assignee.get("_id"))

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": "Perf task coverage",
                "description": "Created for mutation endpoint coverage",
                "assigned_user_id": assignee_id,
            },
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task = resp.json()
            task_id = task.get("id", task.get("_id"))

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": "Updated perf task coverage",
                "description": "Updated for coverage validation",
            },
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"update_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"update_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assignee_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"assign_task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"assign_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        comment_id = None
        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={
                "content": "Coverage scenario comment",
                "user_id": self.current_user_id,
            },
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create_comment: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"create_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
            else:
                comment = resp.json()
                comment_id = comment.get("id", comment.get("_id"))

        if comment_id:
            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": "Coverage scenario comment (edited)"},
                headers={"X-User-Id": self.current_user_id},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"update_comment: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"update_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

            with self.client.delete(
                f"/api/comments/{comment_id}",
                headers={"X-User-Id": self.current_user_id},
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"delete_comment: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"delete_comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"delete_task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"delete_task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
