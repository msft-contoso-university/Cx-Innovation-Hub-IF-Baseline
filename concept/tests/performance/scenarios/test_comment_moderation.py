"""
Scenario: Comment Moderation

Simulates creating, editing, and deleting a comment owned by the current user.
Thresholds: GET p95 < 500 ms, POST/PUT/DELETE p95 < 1000 ms.
"""

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class CommentModerationUser(TaskifyBaseUser):
    """User that exercises comment edit and delete flows."""

    weight = 2

    @task
    def moderate_comment(self):
        """Create a comment, update it, and delete it."""
        if not self.projects:
            return

        project_id = self.projects[0].get("id", self.projects[0].get("_id"))
        created_comment_id = None

        with self.client.get(
            f"/api/projects/{project_id}/tasks",
            name="[moderation] GET /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"moderate_comment tasks: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 500:
                resp.failure(
                    f"moderate_comment tasks: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 500ms"
                )
                return
            tasks = resp.json()

        if not tasks:
            return

        task_id = tasks[0].get("id", tasks[0].get("_id"))
        headers = {"X-User-Id": self.current_user_id}

        with self.client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Comment created by {self.current_user_id}"},
            headers=headers,
            name="[moderation] POST /api/tasks/:taskId/comments",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"moderate_comment create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"moderate_comment create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return
            created_comment = resp.json()
            created_comment_id = created_comment.get("id", created_comment.get("_id"))

        try:
            with self.client.put(
                f"/api/comments/{created_comment_id}",
                json={"content": f"Updated comment by {self.current_user_id}"},
                headers=headers,
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"moderate_comment update: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"moderate_comment update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
        finally:
            if not created_comment_id:
                return
            with self.client.delete(
                f"/api/comments/{created_comment_id}",
                headers=headers,
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"moderate_comment delete: status {resp.status_code}")
                elif resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"moderate_comment delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
