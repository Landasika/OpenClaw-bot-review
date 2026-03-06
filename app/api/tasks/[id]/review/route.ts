import { NextResponse } from "next/server";
import * as FeishuNotifier from "@/lib/feishu-notifier";
import { taskStore } from "@/lib/task-store";
import { getDefaultAgentId } from "@/lib/system-config";

// POST /api/tasks/[id]/review - Boss审查任务
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const defaultAgentId = getDefaultAgentId();
    const { id } = await params;
    const { approved, comment, score, createFollowUpTask, followUpTaskTitle, followUpTaskDescription } = await req.json();

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Missing required field: approved (boolean)" },
        { status: 400 }
      );
    }

    const task = await taskStore.getTask(id);
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    const now = Date.now();
    const updates: any = {
      status: approved ? "approved" : "rejected",
      reviewedBy: defaultAgentId,
      reviewedAt: now,
      reviewComment: comment,
      reviewScore: score,
    };

    const updated = await taskStore.updateTask(id, updates);

    // 如果需要创建后续任务
    let followUpTask = null;
    if (!approved && createFollowUpTask) {
      followUpTask = await taskStore.createTask({
        id: taskStore.generateId(),
        title: followUpTaskTitle || `重做: ${task.title}`,
        description: followUpTaskDescription || `原任务未通过审查，需要重新完成。\n\nBoss意见: ${comment || "请改进后再提交"}`,
        status: "assigned",
        priority: task.priority,
        assignedTo: task.assignedTo,
        createdBy: defaultAgentId,
        createdAt: now,
        updatedAt: now,
        parentTaskId: task.id,
        tags: task.tags,
        estimatedHours: task.estimatedHours,
      });
    }

    return NextResponse.json({
      success: true,
      task: updated,
      followUpTask,
      message: approved
        ? "Task approved and completed"
        : createFollowUpTask
        ? "Task rejected. Follow-up task created."
        : "Task rejected",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
