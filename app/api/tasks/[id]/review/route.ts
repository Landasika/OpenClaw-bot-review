import { NextResponse } from "next/server";
import * as FeishuNotifier from "@/lib/feishu-notifier";
import { loadTaskMap } from "@/lib/task-dependency";
import { assessTaskReview } from "@/lib/task-review";
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
    const body = await req.json();
    const {
      approved,
      comment,
      score,
      createFollowUpTask,
      createFollowUp,
      followUpTaskTitle,
      followUpTaskDescription,
    } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Missing required field: approved (boolean)" },
        { status: 400 }
      );
    }

    const reviewCommentInput = typeof comment === "string" ? comment.trim() : "";
    if (!reviewCommentInput) {
      return NextResponse.json(
        { success: false, error: "审查意见不能为空" },
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

    const taskMap = await loadTaskMap();
    taskMap.set(task.id, task);
    const systemAssessment = assessTaskReview(task, taskMap);

    if (typeof score !== "number" || !Number.isFinite(score)) {
      return NextResponse.json(
        { success: false, error: "评分不能为空，且必须为 1-5 的数字" },
        { status: 400 }
      );
    }

    const normalizedScore = Math.max(1, Math.min(5, Math.round(score)));
    if (approved && normalizedScore < 4) {
      return NextResponse.json(
        { success: false, error: "通过审查时评分必须至少为 4 分" },
        { status: 400 }
      );
    }
    if (!approved && normalizedScore > 3) {
      return NextResponse.json(
        { success: false, error: "驳回任务时评分不能高于 3 分" },
        { status: 400 }
      );
    }

    if (approved && !systemAssessment.approved) {
      return NextResponse.json(
        {
          success: false,
          error: "系统校验未通过，当前任务不能批准",
          assessment: {
            score: systemAssessment.score,
            comment: systemAssessment.comment,
            unmetAcceptanceCriteria: systemAssessment.unmetAcceptanceCriteria,
            blockedReason: systemAssessment.dependencyCheck.blockedReason,
          },
        },
        { status: 400 }
      );
    }

    const coveredCount = systemAssessment.acceptanceCriteria.length - systemAssessment.unmetAcceptanceCriteria.length;
    const acceptanceSummary = systemAssessment.acceptanceCriteria.length > 0
      ? `${coveredCount}/${systemAssessment.acceptanceCriteria.length}`
      : "无结构化验收标准";
    const dependencySummary = systemAssessment.dependencyCheck.satisfied
      ? "通过"
      : systemAssessment.dependencyCheck.blockedReason;
    const reviewComment = `${reviewCommentInput}

【系统校验摘要】
- 自动审查评分: ${systemAssessment.score}/5
- 验收覆盖: ${acceptanceSummary}
- 依赖检查: ${dependencySummary}`;

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
    const shouldCreateFollowUpTask = !approved && (createFollowUpTask === true || createFollowUp === true);
    if (shouldCreateFollowUpTask) {
      const followUpAssignedTo = task.assignedTo;
      followUpTask = await taskStore.createTask({
        id: taskStore.generateId(),
        title: followUpTaskTitle || `重做: ${task.title}`,
        description: followUpTaskDescription || `原任务未通过审查，需要重新完成。\n\nBoss意见: ${reviewComment}`,
        acceptanceCriteria: task.acceptanceCriteria,
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
        : shouldCreateFollowUpTask
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
