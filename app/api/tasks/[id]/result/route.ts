import { NextResponse } from "next/server";
import { taskStore } from "@/lib/task-store";

// POST /api/tasks/[id]/result - 员工提交任务执行结果
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { result, attachments, actualHours } = await req.json();

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Missing required field: result" },
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
    if (task.status !== "assigned" && task.status !== "in_progress") {
      return NextResponse.json(
        {
          success: false,
          error: `Task status is ${task.status}, only assigned/in_progress can submit result`,
        },
        { status: 400 }
      );
    }

    const now = Date.now();
    const updated = await taskStore.updateTask(id, {
      status: "submitted",
      result,
      attachments: attachments || [],
      actualHours,
      completedAt: now,
    });

    return NextResponse.json({
      success: true,
      task: updated,
      message: "Task result submitted for review",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
