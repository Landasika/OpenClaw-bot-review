import { NextResponse } from "next/server";
import { taskStore } from "@/lib/task-store";

// POST /api/tasks/assign - 分配任务给员工
export async function POST(req: Request) {
  try {
    const { taskId, assignedTo } = await req.json();

    if (!taskId || !assignedTo) {
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

    // 更新任务状态
    const updated = await taskStore.updateTask(taskId, {
      assignedTo,
      status: "assigned",
    });

    return NextResponse.json({
      success: true,
      task: updated,
      message: `Task assigned to ${assignedTo}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
