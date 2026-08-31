// =============================================================================
// Kanban Card Ownership Helpers
// =============================================================================
// Pure helper functions extracted from Card/Column so the "assigned to
// current user" highlighting logic can be unit tested without rendering
// React components.
// =============================================================================

import type { Task } from "../../api/types";

/**
 * Returns true when the given task is assigned to the current user.
 * A null/undefined currentUserId (no signed-in user) never matches.
 */
export function isTaskAssignedToUser(task: Task, currentUserId: string): boolean {
  return Boolean(currentUserId) && task.assigned_user_id === currentUserId;
}

/**
 * Computes the card border/ring className based on drag state and
 * whether the card is assigned to the current user. Dragging state takes
 * precedence over ownership highlighting.
 */
export function getCardClassName(options: {
  isDragging: boolean;
  isAssignedToCurrentUser: boolean;
}): string {
  const { isDragging, isAssignedToCurrentUser } = options;

  if (isDragging) {
    return "shadow-lg border-blue-300";
  }

  if (isAssignedToCurrentUser) {
    return "border-blue-300 ring-2 ring-blue-200 hover:shadow-md";
  }

  return "border-gray-200 hover:shadow-md";
}
