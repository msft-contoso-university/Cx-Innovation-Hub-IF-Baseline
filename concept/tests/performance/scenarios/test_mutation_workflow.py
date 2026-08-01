"""
Scenario: Project and Task Mutation Workflow

Simulates a user creating a project, creating and updating a task,
assigning it, moderating a comment, and deleting the task.
Thresholds: POST/PUT/PATCH/DELETE p95 < 1000 ms.
"""

from itertools import count

from locust import task

try:
    from .base import TaskifyBaseUser
except ImportError:
    from base import TaskifyBaseUser


class MutationWorkflowUser(TaskifyBaseUser):
    """User that exercises uncovered write-heavy API workflows."""

    weight = 2
    _project_counter = count(1)
    _task_counter = count(1)
    _comment_counter = count(1)

    def on_start(self):
        """Fetch seed data and provision a reusable project for this user."""
        super().on_start()
        self.project_id = None

    def _ensure_project(self):
        """Create one dedicated project per simulated user session."""
        if self.project_id:
            return self.project_id

        suffix = next(self._project_counter)
        with self.client.post(
            "/api/projects",
            json={
                "name": f"Locust Mutation Project {suffix}",
                "description": f"Performance-created project {suffix}",
            },
            name="POST /api/projects",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"mutation_workflow project: status {resp.status_code}")
                return None
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_workflow project: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return None

            project = resp.json()
            self.project_id = project.get("id", project.get("_id"))
            self.projects.insert(0, project)

        return self.project_id

    @task
    def mutation_workflow(self):
        """Exercise high-risk uncovered mutation endpoints with cleanup."""
        project_id = self._ensure_project()
        if not project_id:
            return

        task_suffix = next(self._task_counter)
        task_id = None
        comment_id = None

        assignee_id = None
        if self.users:
            assignee = self.users[0]
            assignee_id = assignee.get("id", assignee.get("_id"))

        with self.client.post(
            f"/api/projects/{project_id}/tasks",
            json={
                "title": f"Mutation task {task_suffix}",
                "description": f"Created by performance workflow {task_suffix}",
            },
            name="POST /api/projects/:id/tasks",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"mutation_workflow task create: status {resp.status_code}")
                return
            if resp.elapsed.total_seconds() * 1000 > 1000:
                resp.failure(
                    f"mutation_workflow task create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                )
                return

            task = resp.json()
            task_id = task.get("id", task.get("_id"))

        try:
            with self.client.put(
                f"/api/tasks/{task_id}",
                json={
                    "title": f"Mutation task {task_suffix} updated",
                    "description": f"Updated by performance workflow {task_suffix}",
                },
                name="PUT /api/tasks/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"mutation_workflow task update: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"mutation_workflow task update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

            if assignee_id:
                with self.client.patch(
                    f"/api/tasks/{task_id}/assign",
                    json={"assigned_user_id": assignee_id},
                    name="PATCH /api/tasks/:id/assign",
                    catch_response=True,
                ) as resp:
                    if resp.status_code != 200:
                        resp.failure(f"mutation_workflow task assign: status {resp.status_code}")
                        return
                    if resp.elapsed.total_seconds() * 1000 > 1000:
                        resp.failure(
                            f"mutation_workflow task assign: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                        )
                        return

            comment_suffix = next(self._comment_counter)
            with self.client.post(
                f"/api/tasks/{task_id}/comments",
                json={
                    "content": f"Mutation workflow comment {comment_suffix}",
                    "user_id": self.current_user_id,
                },
                name="POST /api/tasks/:taskId/comments",
                catch_response=True,
            ) as resp:
                if resp.status_code != 201:
                    resp.failure(f"mutation_workflow comment create: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"mutation_workflow comment create: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

                comment = resp.json()
                comment_id = comment.get("id", comment.get("_id"))

            with self.client.put(
                f"/api/comments/{comment_id}",
                json={"content": f"Mutation workflow comment {comment_suffix} updated"},
                name="PUT /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"mutation_workflow comment update: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"mutation_workflow comment update: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

            with self.client.delete(
                f"/api/comments/{comment_id}",
                name="DELETE /api/comments/:id",
                catch_response=True,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"mutation_workflow comment delete: status {resp.status_code}")
                    return
                if resp.elapsed.total_seconds() * 1000 > 1000:
                    resp.failure(
                        f"mutation_workflow comment delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                    )
                    return

                comment_id = None
        finally:
            if task_id:
                with self.client.delete(
                    f"/api/tasks/{task_id}",
                    name="DELETE /api/tasks/:id",
                    catch_response=True,
                ) as resp:
                    if resp.status_code != 200:
                        resp.failure(f"mutation_workflow task delete: status {resp.status_code}")
                    elif resp.elapsed.total_seconds() * 1000 > 1000:
                        resp.failure(
                            f"mutation_workflow task delete: response time {resp.elapsed.total_seconds()*1000:.0f}ms > 1000ms"
                        )
