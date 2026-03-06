import { NextResponse } from "next/server";
import { taskStore } from "@/lib/task-store";
import type { Task } from "@/lib/task-types";
import { normalizeAgentId } from "@/lib/agent-id";
import {
  assertTaskDependenciesValid,
  canEditTaskDependencies,
  loadTaskMap,
  normalizeDependsOnTaskIds,
  resolveAssignmentStateByDependencies,
} from "@/lib/task-dependency";

// GET /api/tasks/[id] - 获取单个任务详情
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await taskStore.getTask(id);

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      task,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// PATCH /api/tasks/[id] - 更新任务（通用更新）
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentTask = await taskStore.getTask(id);
    if (!currentTask) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    const rawUpdates = await req.json();
    if (rawUpdates.parentTaskId !== undefined) {
      return NextResponse.json(
        { success: false, error: "parentTaskId 已弃用，请使用 dependsOnTaskIds" },
        { status: 400 }
      );
    }

    const updates: Partial<Task> = { ...rawUpdates };
    const hasDependencyUpdate = Object.prototype.hasOwnProperty.call(rawUpdates, "dependsOnTaskIds");

    if (hasDependencyUpdate) {
      if (!canEditTaskDependencies(currentTask.status)) {
        return NextResponse.json(
          { success: false, error: `Task status is ${currentTask.status}, cannot update dependencies` },
          { status: 400 }
        );
      }

      updates.dependsOnTaskIds = normalizeDependsOnTaskIds(rawUpdates.dependsOnTaskIds);
    }

    const hasAssignmentUpdate = Object.prototype.hasOwnProperty.call(rawUpdates, "assignedTo");
    const shouldRecomputeAssignment = hasDependencyUpdate || hasAssignmentUpdate;

    if (shouldRecomputeAssignment) {
      const dependsOnTaskIds = (updates.dependsOnTaskIds as string[] | undefined) || currentTask.dependsOnTaskIds || [];
      const assignedTo = updates.assignedTo !== undefined
        ? (typeof updates.assignedTo === "string" && updates.assignedTo.trim() !== ""
          ? normalizeAgentId(updates.assignedTo.trim())
          : undefined)
        : currentTask.assignedTo;
      updates.assignedTo = assignedTo;

      const taskMap = await loadTaskMap();
      const nextTask = {
        ...currentTask,
        ...updates,
        dependsOnTaskIds,
        assignedTo,
      };

      assertTaskDependenciesValid(id, dependsOnTaskIds, taskMap);
      taskMap.set(id, nextTask);

      if (canEditTaskDependencies(currentTask.status)) {
        if (assignedTo) {
          const assignmentState = resolveAssignmentStateByDependencies(nextTask, taskMap);
          updates.status = assignmentState.status;
          updates.blockedReason = assignmentState.blockedReason;
        } else {
          updates.status = "pending";
          updates.blockedReason = undefined;
        }
      }
    }

    const task = await taskStore.updateTask(id, updates);
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      task,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id] - 删除任务
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await taskStore.deleteTask(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
