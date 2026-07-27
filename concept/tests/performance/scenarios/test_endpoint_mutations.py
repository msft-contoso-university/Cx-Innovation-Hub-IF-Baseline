"""
Scenario: Endpoint Mutations

Simulates project/task/comment write lifecycle operations for uncovered API routes.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

import time

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class EndpointMutationsUser(TaskifyBaseUser):
    """User that exercises create/update/assign/edit/delete endpoint flow."""

    weight = 2

    @task
    def mutation_flow(self):
        """Create project+task, mutate records, then clean up with deletes."""
        suffix = time.time_ns()
        project_name = f"Perf Test Project {suffix}"

        with self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Created by Locust scenario"},
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

        project_id = project.get("id")
        if not project_id:
            return

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": f"Perf Task {suffix}", "description": "Locust task create"},
            name="POST /api/projects/:projectId/tasks",
            catch_response=True,
        ) as task_resp:
            if task_resp.status_code != 201:
                task_resp.failure(f"mutation_flow task create: status {task_resp.status_code}")
                return
            if task_resp.elapsed.total_seconds() * 1000 > 1000:
                task_resp.failure(
                    f"mutation_flow task create: response time {task_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            task = task_resp.json()

        task_id = task.get("id")
        if not task_id:
            return

        with self.client.put(
            f"/api/tasks/{task_id}",
            json={"title": f"Updated Perf Task {suffix}", "description": "Updated by Locust"},
            name="PUT /api/tasks/:id",
            catch_response=True,
        ) as update_resp:
            if update_resp.status_code != 200:
                update_resp.failure(f"mutation_flow task update: status {update_resp.status_code}")
                return
            if update_resp.elapsed.total_seconds() * 1000 > 1000:
                update_resp.failure(
                    f"mutation_flow task update: response time {update_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.patch(
            f"/api/tasks/{task_id}/assign",
            json={"assigned_user_id": self.current_user_id},
            name="PATCH /api/tasks/:id/assign",
            catch_response=True,
        ) as assign_resp:
            if assign_resp.status_code != 200:
                assign_resp.failure(f"mutation_flow task assign: status {assign_resp.status_code}")
                return
            if assign_resp.elapsed.total_seconds() * 1000 > 1000:
                assign_resp.failure(
                    f"mutation_flow task assign: response time {assign_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Perf comment {suffix}"},
            headers={"X-User-Id": self.current_user_id},
            name="[mutation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as create_comment_resp:
            if create_comment_resp.status_code != 201:
                create_comment_resp.failure(
                    f"mutation_flow comment create: status {create_comment_resp.status_code}"
                )
                return
            if create_comment_resp.elapsed.total_seconds() * 1000 > 1000:
                create_comment_resp.failure(
                    f"mutation_flow comment create: response time {create_comment_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            comment = create_comment_resp.json()

        comment_id = comment.get("id")
        if not comment_id:
            return

        with self.client.put(
            f"/api/comments/{comment_id}",
            json={"content": f"Edited perf comment {suffix}"},
            headers={"X-User-Id": self.current_user_id},
            name="PUT /api/comments/:id",
            catch_response=True,
        ) as edit_comment_resp:
            if edit_comment_resp.status_code != 200:
                edit_comment_resp.failure(
                    f"mutation_flow comment edit: status {edit_comment_resp.status_code}"
                )
                return
            if edit_comment_resp.elapsed.total_seconds() * 1000 > 1000:
                edit_comment_resp.failure(
                    f"mutation_flow comment edit: response time {edit_comment_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/comments/{comment_id}",
            headers={"X-User-Id": self.current_user_id},
            name="DELETE /api/comments/:id",
            catch_response=True,
        ) as delete_comment_resp:
            if delete_comment_resp.status_code != 200:
                delete_comment_resp.failure(
                    f"mutation_flow comment delete: status {delete_comment_resp.status_code}"
                )
                return
            if delete_comment_resp.elapsed.total_seconds() * 1000 > 1000:
                delete_comment_resp.failure(
                    f"mutation_flow comment delete: response time {delete_comment_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

        with self.client.delete(
            f"/api/tasks/{task_id}",
            name="DELETE /api/tasks/:id",
            catch_response=True,
        ) as delete_task_resp:
            if delete_task_resp.status_code != 200:
                delete_task_resp.failure(f"mutation_flow task delete: status {delete_task_resp.status_code}")
                return
            if delete_task_resp.elapsed.total_seconds() * 1000 > 1000:
                delete_task_resp.failure(
                    f"mutation_flow task delete: response time {delete_task_resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
