import { NextResponse } from "next/server";
import * as FeishuNotifier from "@/lib/feishu-notifier";
import { taskStore } from "@/lib/task-store";
import { normalizeAgentId } from "@/lib/agent-id";
import {
  loadTaskMap,
  resolveAssignmentStateByDependencies,
} from "@/lib/task-dependency";

// POST /api/tasks/assign - 分配任务给员工
export async function POST(req: Request) {
  try {
    const { taskId, assignedTo } = await req.json();
    const normalizedAssignedTo = normalizeAgentId(
      typeof assignedTo === "string" ? assignedTo.trim() : undefined
    ) || "";

    if (!taskId || !normalizedAssignedTo) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: taskId, assignedTo" },
        { status: 400 }
      );
    }

    const task = await taskStore.getTask(taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    const taskMap = await loadTaskMap();
    taskMap.set(task.id, task);
    const assignmentState = resolveAssignmentStateByDependencies(task, taskMap);

    // 更新任务状态（依赖未满足则进入 blocked）
    const updated = await taskStore.updateTask(taskId, {
      assignedTo: normalizedAssignedTo,
      status: assignmentState.status,
      blockedReason: assignmentState.blockedReason,
    });
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }
    if (updated.status === "assigned" && updated.assignedTo) {
      FeishuNotifier.notifyTaskAssigned(
        updated.id,
        updated.title,
        updated.description,
        updated.assignedTo
      ).catch(err => console.error("[Feishu] 通知失败:", err));
    }

    return NextResponse.json({
      success: true,
      task: updated,
      message: assignmentState.status === "blocked"
        ? `Task assigned to ${normalizedAssignedTo}, but blocked: ${assignmentState.blockedReason}`
        : `Task assigned to ${normalizedAssignedTo}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
