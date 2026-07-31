"""
Scenario: Task Lifecycle Management

Simulates creating and managing project tasks and their comments through
update, assignment, and delete operations.
Thresholds: POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class TaskLifecycleUser(TaskifyBaseUser):
    """User that exercises project/task/comment write lifecycle endpoints."""

    weight = 2

    @task
    def task_lifecycle_flow(self):
        """Create and mutate project, task, and comment resources."""
        if not self.current_user_id:
            return

        project_name = f"Perf Lifecycle Project {self.current_user_id}"
        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Performance lifecycle scenario"},
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create project: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": "Performance lifecycle task", "description": "Scenario task"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task_data = resp.json()

        task_id = task_data.get("id", task_data.get("_id"))
        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": "Performance lifecycle task updated", "description": "Updated in scenario"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        assigned_user_id = self.current_user_id
        if self.users:
            assigned_user = self.users[0]
            assigned_user_id = assigned_user.get("id", assigned_user.get("_id", self.current_user_id))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle assign task: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle assign task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": "Performance lifecycle comment"},
            headers={"X-User-Id": str(self.current_user_id)},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"task_lifecycle create comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle create comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment = resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Performance lifecycle comment updated"},
            headers={"X-User-Id": str(self.current_user_id)},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle update comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle update comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": str(self.current_user_id)},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete comment: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete comment: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"task_lifecycle delete task: status {resp.status_code}")
            elif resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"task_lifecycle delete task: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
