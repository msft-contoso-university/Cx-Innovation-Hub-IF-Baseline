"""
Locust Performance Tests for Taskify Kanban Board API

Entry point that imports all scenario User classes from the scenarios/ package.
Each scenario lives in its own module under scenarios/ for maintainability.

Scenarios loaded:
  - BrowseProjectsUser    (weight 3) — browse project list and details
  - KanbanBoardUser       (weight 4) — load board and drag-drop status changes
  - CommentActivityUser   (weight 2) — read and post task comments
  - HealthCheckUser       (weight 1) — lightweight health probe
  - UserDirectoryUser     (weight 3) — browse user directory and view profiles
  - ProjectMutationsUser  (weight 1) — create new projects
  - TaskMutationsUser     (weight 2) — create, update, assign and delete tasks
  - CommentMutationsUser  (weight 1) — edit and delete comments
"""

import os

from scenarios import (  # noqa: F401  — Locust discovers these at import time
    BrowseProjectsUser,
    KanbanBoardUser,
    CommentActivityUser,
    HealthCheckUser,
    UserDirectoryUser,
    ProjectMutationsUser,
    TaskMutationsUser,
    CommentMutationsUser,
)

BASE_URL = os.environ.get("TASKIFY_BASE_URL", "http://localhost:3000")

# ------------------------------------------------------------------
# Programmatic execution
# ------------------------------------------------------------------
if __name__ == "__main__":
    import locust.main

    os.environ.setdefault("LOCUST_HOST", BASE_URL)

    locust.main.main(
        [
            "-f", __file__,
            "--headless",
            "-u", "50",
            "-r", "10",
            "-t", "2m",
            "--csv", "results/taskify",
        ]
    )
