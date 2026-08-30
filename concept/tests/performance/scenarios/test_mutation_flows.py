"""
Scenario: Mutation Endpoint Coverage

Simulates project/task/comment lifecycle mutations to cover high-risk write paths.
Thresholds: POST/PATCH/PUT/DELETE p95 < 1000 ms.
"""

import random
import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationFlowsUser(TaskifyBaseUser):
    """User that exercises write endpoints with ownership-sensitive flows."""

    weight = 2

    @task
    def mutation_flow(self):
        """Create and mutate project/task/comment resources, then clean up."""
        if not self.current_user_id:
            return

        project_name = f"Perf Project {int(time.time() * 1000)}-{random.randint(100, 999)}"
        task_title = f"Perf Task {random.randint(1000, 9999)}"

        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Perf coverage scenario"},
            name="POST /api/projects",
            catch_response=True,
        ) as project_resp:
            if project_resp.status_code != 201:
                project_resp.failure(f"mutation_flow project create: status {project_resp.status_code}")
                return
            if project_resp.elapsed.total_seconds() * 1000 > 1000:
                project_resp.failure(
                    f"mutation_flow project create: response time {project_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            project = project_resp.json()

        project_id = project.get("id", project.get("_id"))
        if not project_id:
            return

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": task_title, "description": "Created by performance mutation flow"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as task_create_resp:
            if task_create_resp.status_code != 201:
                task_create_resp.failure(f"mutation_flow task create: status {task_create_resp.status_code}")
                return
            if task_create_resp.elapsed.total_seconds() * 1000 > 1000:
                task_create_resp.failure(
                    f"mutation_flow task create: response time {task_create_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task = task_create_resp.json()

        task_id = task.get("id", task.get("_id"))
        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"{task_title} Updated", "description": "Updated by performance mutation flow"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as task_update_resp:
            if task_update_resp.status_code != 200:
                task_update_resp.failure(f"mutation_flow task update: status {task_update_resp.status_code}")
                return
            if task_update_resp.elapsed.total_seconds() * 1000 > 1000:
                task_update_resp.failure(
                    f"mutation_flow task update: response time {task_update_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        assignee = random.choice(self.users) if self.users else None
        assigned_user_id = None
        if assignee:
            assigned_user_id = assignee.get("id", assignee.get("_id"))

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": assigned_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as task_assign_resp:
            if task_assign_resp.status_code != 200:
                task_assign_resp.failure(f"mutation_flow task assign: status {task_assign_resp.status_code}")
                return
            if task_assign_resp.elapsed.total_seconds() * 1000 > 1000:
                task_assign_resp.failure(
                    f"mutation_flow task assign: response time {task_assign_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={
                "content": "Performance mutation flow comment",
                "user_id": int(self.current_user_id) if self.current_user_id.isdigit() else self.current_user_id,
            },
            headers={"X-User-Id": self.current_user_id},
            name="POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as comment_create_resp:
            if comment_create_resp.status_code != 201:
                comment_create_resp.failure(
                    f"mutation_flow comment create: status {comment_create_resp.status_code}"
                )
                return
            if comment_create_resp.elapsed.total_seconds() * 1000 > 1000:
                comment_create_resp.failure(
                    f"mutation_flow comment create: response time {comment_create_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment = comment_create_resp.json()

        comment_id = comment.get("id", comment.get("_id"))
        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": "Performance mutation flow comment updated"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as comment_update_resp:
            if comment_update_resp.status_code != 200:
                comment_update_resp.failure(
                    f"mutation_flow comment update: status {comment_update_resp.status_code}"
                )
                return
            if comment_update_resp.elapsed.total_seconds() * 1000 > 1000:
                comment_update_resp.failure(
                    f"mutation_flow comment update: response time {comment_update_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as comment_delete_resp:
            if comment_delete_resp.status_code != 200:
                comment_delete_resp.failure(
                    f"mutation_flow comment delete: status {comment_delete_resp.status_code}"
                )
                return
            if comment_delete_resp.elapsed.total_seconds() * 1000 > 1000:
                comment_delete_resp.failure(
                    f"mutation_flow comment delete: response time {comment_delete_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as task_delete_resp:
            if task_delete_resp.status_code != 200:
                task_delete_resp.failure(f"mutation_flow task delete: status {task_delete_resp.status_code}")
                return
            if task_delete_resp.elapsed.total_seconds() * 1000 > 1000:
                task_delete_resp.failure(
                    f"mutation_flow task delete: response time {task_delete_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
