// =============================================================================
// Kanban Column Component
// =============================================================================
// Renders a single Kanban column (e.g., "To Do", "In Progress") as a
// droppable zone. Contains Card components and a task count badge.
// =============================================================================

import { Droppable } from "@hello-pangea/dnd";
import Card from "./Card";
import type { Task, TaskStatus } from "../../api/types";
import { STATUS_LABELS } from "../../api/types";
import { isTaskAssignedToUser } from "./cardStyles";

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
  currentUserId: string;
  onCardClick: (task: Task) => void;
}

const COLUMN_COLORS: Record<TaskStatus, string> = {
  todo: "bg-gray-100",
  in_progress: "bg-blue-50",
  in_review: "bg-yellow-50",
  done: "bg-green-50",
};

const HEADER_COLORS: Record<TaskStatus, string> = {
  todo: "text-gray-700",
  in_progress: "text-blue-700",
  in_review: "text-yellow-700",
  done: "text-green-700",
};

export default function Column({ status, tasks, currentUserId, onCardClick }: ColumnProps) {
  return (
    <div className={`${COLUMN_COLORS[status]} rounded-lg p-3 min-h-[200px] flex flex-col`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold ${HEADER_COLORS[status]}`}>
          {STATUS_LABELS[status]}
        </h3>
        <span className="text-xs bg-white text-gray-500 rounded-full px-2 py-0.5 font-medium">
          {tasks.length}
        </span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 min-h-[100px] rounded transition-colors ${
              snapshot.isDraggingOver ? "bg-blue-100/50" : ""
            }`}
          >
            {tasks.map((task, index) => (
              <Card
                key={task.id}
                task={task}
                index={index}
                isAssignedToCurrentUser={isTaskAssignedToUser(task, currentUserId)}
                onClick={onCardClick}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
