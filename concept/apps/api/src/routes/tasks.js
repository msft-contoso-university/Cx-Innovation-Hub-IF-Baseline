// =============================================================================
// Tasks Routes
// =============================================================================
// GET    /api/projects/:projectId/tasks   - List tasks for a project
// POST   /api/projects/:projectId/tasks   - Create a task in a project
// PUT    /api/tasks/:id                   - Update a task
// PATCH  /api/tasks/:id/status            - Change task status (drag-and-drop)
// PATCH  /api/tasks/:id/assign            - Assign/unassign a user
// DELETE /api/tasks/:id                   - Delete a task
// =============================================================================

const { Router } = require("express");
const { getPool } = require("../services/database");
const { createError } = require("../middleware/errorHandler");

const router = Router();

const VALID_STATUSES = ["todo", "in_progress", "in_review", "done"];

/**
 * GET /api/projects/:projectId/tasks
 * Returns all tasks for a project, ordered by status and position.
 * Includes assigned user details via LEFT JOIN.
 */
router.get("/projects/:projectId/tasks", async (req, res, next) => {
  try {
    const { rows } = await getPool().query(
      `SELECT
        t.id, t.project_id, t.title, t.description,
        t.status, t.position, t.assigned_user_id,
        t.created_at, t.updated_at,
        u.name AS assigned_user_name,
        u.avatar_color AS assigned_user_avatar_color
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.project_id = $1
      ORDER BY t.position, t.created_at`,
      [req.params.projectId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects/:projectId/tasks
 * Creates a new task. Requires { title } in body.
 * Optional: description, assigned_user_id.
 */
router.post("/projects/:projectId/tasks", async (req, res, next) => {
  try {
    const { title, description, assigned_user_id } = req.body;

    if (!title || !title.trim()) {
      return next(createError(400, "Title is required"));
    }
    if (title.trim().length > 200) {
      return next(createError(400, "Title must be 200 characters or less"));
    }
    if (description && description.length > 1000) {
      return next(createError(400, "Description must be 1000 characters or less"));
    }

    // Verify the project exists before creating the task
    const { rows: projectRows } = await getPool().query(
      "SELECT id FROM projects WHERE id = $1",
      [req.params.projectId]
    );
    if (projectRows.length === 0) {
      return next(createError(404, "Project not found"));
    }

    // Get the next position for new tasks in the "todo" column
    const { rows: posRows } = await getPool().query(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tasks WHERE project_id = $1 AND status = 'todo'",
      [req.params.projectId]
    );
    const nextPos = posRows[0].next_pos;

    const { rows } = await getPool().query(
      `INSERT INTO tasks (project_id, title, description, status, position, assigned_user_id)
       VALUES ($1, $2, $3, 'todo', $4, $5)
       RETURNING *`,
      [req.params.projectId, title.trim(), description || null, nextPos, assigned_user_id || null]
    );

    // Fetch with user details
    const { rows: taskRows } = await getPool().query(
      `SELECT
        t.*, u.name AS assigned_user_name, u.avatar_color AS assigned_user_avatar_color
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = $1`,
      [rows[0].id]
    );

    res.status(201).json(taskRows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/tasks/:id
 * Updates a task's title and/or description.
 */
router.put("/tasks/:id", async (req, res, next) => {
  try {
    const { title, description } = req.body;
    if (!title || !title.trim()) {
      return next(createError(400, "Task title is required"));
    }

    const { rows } = await getPool().query(
      `UPDATE tasks SET title = $1, description = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [title.trim(), description || null, req.params.id]
    );

    if (rows.length === 0) {
      return next(createError(404, "Task not found"));
    }

    // Fetch with user details
    const { rows: taskRows } = await getPool().query(
      `SELECT
        t.*, u.name AS assigned_user_name, u.avatar_color AS assigned_user_avatar_color
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = $1`,
      [rows[0].id]
    );

    res.json(taskRows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/tasks/:id/status
 * Changes task status and position (used by Kanban drag-and-drop).
 * Requires { status, position } in body.
 */
router.patch("/tasks/:id/status", async (req, res, next) => {
  try {
    const { status, position } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return next(
        createError(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`)
      );
    }

    if (position === undefined || position === null) {
      return next(createError(400, "Position is required"));
    }

    const { rows } = await getPool().query(
      `UPDATE tasks SET status = $1, position = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, position, req.params.id]
    );

    if (rows.length === 0) {
      return next(createError(404, "Task not found"));
    }

    // Fetch with user details
    const { rows: taskRows } = await getPool().query(
      `SELECT
        t.*, u.name AS assigned_user_name, u.avatar_color AS assigned_user_avatar_color
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = $1`,
      [rows[0].id]
    );

    res.json(taskRows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/tasks/:id/assign
 * Assigns or unassigns a user to a task.
 * Requires { assigned_user_id } in body (null to unassign).
 */
router.patch("/tasks/:id/assign", async (req, res, next) => {
  try {
    const { assigned_user_id } = req.body;

    const { rows } = await getPool().query(
      `UPDATE tasks SET assigned_user_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [assigned_user_id || null, req.params.id]
    );

    if (rows.length === 0) {
      return next(createError(404, "Task not found"));
    }

    // Fetch with user details
    const { rows: taskRows } = await getPool().query(
      `SELECT
        t.*, u.name AS assigned_user_name, u.avatar_color AS assigned_user_avatar_color
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = $1`,
      [rows[0].id]
    );

    res.json(taskRows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/tasks/:id
 * Deletes a task and its associated comments (via CASCADE).
 */
router.delete("/tasks/:id", async (req, res, next) => {
  try {
    const { rows } = await getPool().query(
      "DELETE FROM tasks WHERE id = $1 RETURNING id",
      [req.params.id]
    );

    if (rows.length === 0) {
      return next(createError(404, "Task not found"));
    }

    res.json({ message: "Task deleted", id: rows[0].id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
