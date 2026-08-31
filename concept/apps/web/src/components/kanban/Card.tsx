// =============================================================================
// Kanban Card Component
// =============================================================================
// Renders a single task card within a Kanban column. Draggable via
// @hello-pangea/dnd. Shows title, assigned user avatar, and comment count
// indicator. Clicking opens the task detail modal.
// =============================================================================

import { Draggable } from "@hello-pangea/dnd";
import type { Task } from "../../api/types";
import { getCardClassName } from "./cardStyles";

interface CardProps {
  task: Task;
  index: number;
  isAssignedToCurrentUser: boolean;
  onClick: (task: Task) => void;
}

export default function Card({ task, index, isAssignedToCurrentUser, onClick }: CardProps) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(task)}
          data-own={isAssignedToCurrentUser ? "true" : "false"}
          className={`bg-white rounded-lg shadow-sm border p-3 mb-2 cursor-pointer transition-shadow ${getCardClassName(
            { isDragging: snapshot.isDragging, isAssignedToCurrentUser }
          )}`}
        >
          <p className="text-sm font-medium text-gray-900 mb-2">{task.title}</p>

          {task.description && (
            <p className="text-xs text-gray-500 mb-2 line-clamp-2">
              {task.description}
            </p>
          )}

          {task.assigned_user_name && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium"
                style={{
                  backgroundColor: task.assigned_user_avatar_color || "#9CA3AF",
                }}
              >
                {task.assigned_user_name.charAt(0)}
              </div>
              <span className="text-xs text-gray-500">{task.assigned_user_name}</span>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
