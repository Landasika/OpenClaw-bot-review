import { NextResponse } from "next/server";
import { normalizeTaskResultSubmission } from "@/lib/task-result";
import { taskStore } from "@/lib/task-store";

// POST /api/tasks/[id]/result - 员工提交任务执行结果
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const task = await taskStore.getTask(id);
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }
    if (task.status !== "assigned" && task.status !== "in_progress") {
      return NextResponse.json(
        {
          success: false,
          error: `Task status is ${task.status}, only assigned/in_progress can submit result`,
        },
        { status: 400 }
      );
    }

    const submission = normalizeTaskResultSubmission(body, task);

    const now = Date.now();
    const updated = await taskStore.updateTask(id, {
      status: "submitted",
      result: submission.result,
      resultDetails: submission.resultDetails,
      attachments: submission.attachments,
      actualHours: submission.actualHours,
      completedAt: now,
    });

    return NextResponse.json({
      success: true,
      task: updated,
      message: "Task result submitted for review",
    });
  } catch (err: any) {
    const message = err.message || "Unknown error";
    const status = /不能为空|必须|缺少|不能提交|格式不正确/.test(message) ? 400 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
