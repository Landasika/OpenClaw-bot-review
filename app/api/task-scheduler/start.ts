import { NextResponse } from "next/server";
import {
  schedulePendingTasks as scheduleTasksDispatch,
} from "@/lib/task-scheduler-service";

export async function GET() {
  try {
    // 立即执行一次调度检查
    await scheduleTasksDispatch();
    
    return NextResponse.json({
      success: true,
      message: "调度检查已执行",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
