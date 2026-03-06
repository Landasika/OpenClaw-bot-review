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
    if (task.status !== "submitted") {
      return NextResponse.json(
        {
          success: false,
          error: `Task status is ${task.status}, only submitted task can be reviewed`,
        },
        { status: 400 }
      );
    }

    const normalizedScore = typeof score === "number" && Number.isFinite(score)
      ? Math.max(1, Math.min(5, Math.round(score)))
      : approved
      ? 5
      : 3;
    const reviewComment = typeof comment === "string" && comment.trim() !== ""
      ? comment.trim()
      : approved
      ? "任务审查通过"
      : "任务审查未通过";

    const now = Date.now();
    const updates: any = {
      status: approved ? "approved" : "rejected",
      reviewedBy: defaultAgentId,
      reviewedAt: now,
      reviewComment,
      reviewScore: normalizedScore,
    };

    const updated = await taskStore.updateTask(id, updates);

    // 如果需要创建后续任务
    let followUpTask = null;
    if (!approved && createFollowUpTask) {
      const followUpAssignedTo = task.assignedTo;
      followUpTask = await taskStore.createTask({
        id: taskStore.generateId(),
        title: followUpTaskTitle || `重做: ${task.title}`,
        description: followUpTaskDescription || `原任务未通过审查，需要重新完成。\n\nBoss意见: ${comment || "请改进后再提交"}`,
        status: followUpAssignedTo ? "assigned" : "pending",
        priority: task.priority,
        assignedTo: followUpAssignedTo,
        createdBy: defaultAgentId,
        createdAt: now,
        updatedAt: now,
        dependsOnTaskIds: [],
        blockedReason: undefined,
        relatedTaskId: task.id,
        tags: task.tags,
        estimatedHours: task.estimatedHours,
      });
    }

    if (approved) {
      FeishuNotifier.notifyTaskApproved(
        id,
        task.title,
        task.assignedTo || "",
        normalizedScore,
        reviewComment
      ).catch(err => console.error("[Feishu] 通知失败:", err));
    } else {
      FeishuNotifier.notifyTaskRejected(
        id,
        task.title,
        task.assignedTo || "",
        normalizedScore,
        reviewComment,
        followUpTask?.id
      ).catch(err => console.error("[Feishu] 通知失败:", err));

      if (followUpTask && followUpTask.assignedTo) {
        FeishuNotifier.notifyImprovementTaskCreated(
          id,
          followUpTask.id,
          followUpTask.title,
          followUpTask.assignedTo
        ).catch(err => console.error("[Feishu] 通知失败:", err));
      }
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
