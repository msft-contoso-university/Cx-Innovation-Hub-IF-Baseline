"""
Scenario: Project and Task Mutation Flow

Simulates creating a project, creating/updating/assigning/deleting a task,
and editing/deleting a comment as the author.
Thresholds: GET p95 < 500 ms, POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class ProjectTaskMutationUser(TaskifyBaseUser):
    """User that executes high-risk mutation endpoints in one isolated flow."""

    weight = 2

    @task
    def project_task_mutation_flow(self):
        """Create project/task, mutate task/comment entities, then clean up."""
        project_id = None
        task_id = None
        comment_id = None

        with self.client.post(
            "/api/projects",
            json={"name": "Perf Coverage Project", "description": "Coverage scenario"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"project create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"project create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project_id = resp.json().get("id")

        if not project_id:
            return

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": "Perf Coverage Task", "description": "Mutation coverage"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_id = resp.json().get("id")

        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": "Perf Coverage Task Updated", "description": "Updated"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task update: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        assign_to = self.current_user_id
        if self.users:
            assign_to = str(self.users[0].get("id", self.current_user_id))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assign_to},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task assign: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Perf Coverage Comment"},
            headers={"X-User-Id": self.current_user_id},
            name="[mutation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"comment create: status {resp.status_code}")
                return
            comment_id = resp.json().get("id")

        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Perf Coverage Comment Updated"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment update: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"comment delete: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"comment delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task delete: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
