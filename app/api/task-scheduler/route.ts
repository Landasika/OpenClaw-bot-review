import { NextResponse } from "next/server";
import {
  startTaskScheduler,
  stopTaskScheduler,
  getSchedulerStatus,
  triggerScheduleCheck,
} from "@/lib/task-scheduler-service";
import {
  startBossReviewer,
  stopBossReviewer,
  getBossReviewerStatus,
  triggerReviewCheck,
} from "@/lib/task-scheduler-extended";
import { getSystemConfig } from "@/lib/system-config";

// GET /api/task-scheduler - 获取调度器和审查器状态
export async function GET() {
  const scheduler = getSchedulerStatus();
  const reviewer = getBossReviewerStatus();
  const systemConfig = getSystemConfig();

  return NextResponse.json({
    success: true,
    scheduler: {
      ...scheduler,
      lastDispatchTimeFormatted: scheduler.lastDispatchTime
        ? new Date(scheduler.lastDispatchTime).toLocaleString("zh-CN")
        : "从未调度",
      uptime: scheduler.running
        ? `${Math.round((Date.now() - (scheduler.lastDispatchTime || Date.now())) / 1000)}秒`
        : "未运行",
    },
    reviewer: {
      ...reviewer,
      lastReviewTimeFormatted: reviewer.lastReviewTime
        ? new Date(reviewer.lastReviewTime).toLocaleString("zh-CN")
        : "从未审查",
      uptime: reviewer.running
        ? `${Math.round((Date.now() - (reviewer.lastReviewTime || Date.now())) / 1000)}秒`
        : "未运行",
    },
    settings: {
      taskDispatchIntervalSeconds: systemConfig.taskDispatchIntervalSeconds,
      taskDispatchMaxConcurrent: systemConfig.taskDispatchMaxConcurrent,
      bossReviewIntervalSeconds: systemConfig.bossReviewIntervalSeconds,
      bossReviewMaxConcurrent: systemConfig.bossReviewMaxConcurrent,
    },
  });
}

// POST /api/task-scheduler - 控制调度器和审查器
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, service } = body;

    // 兼容旧版本（没有 service 参数时默认为 scheduler）
    const targetService = service || "scheduler";

    switch (targetService) {
      case "scheduler":
        return handleSchedulerAction(action);
      case "reviewer":
        return handleReviewerAction(action);
      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown service: ${targetService}`,
          },
          { status: 400 }
        );
    }
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

async function handleSchedulerAction(action: string) {
  switch (action) {
    case "start":
      startTaskScheduler();
      return NextResponse.json({
        success: true,
        message: "调度器已启动",
        scheduler: getSchedulerStatus(),
      });

    case "stop":
      stopTaskScheduler();
      return NextResponse.json({
        success: true,
        message: "调度器已停止",
        scheduler: getSchedulerStatus(),
      });

    case "trigger":
      const result = await triggerScheduleCheck();
      return NextResponse.json({
        success: result.success,
        message: result.success
          ? "手动调度检查完成"
          : "手动调度检查失败",
        result,
        scheduler: getSchedulerStatus(),
      });

    case "restart":
      stopTaskScheduler();
      setTimeout(() => startTaskScheduler(), 1000);
      return NextResponse.json({
        success: true,
        message: "调度器已重启",
        scheduler: getSchedulerStatus(),
      });

    default:
      return NextResponse.json(
        {
          success: false,
          error: `Unknown action: ${action}`,
        },
        { status: 400 }
      );
  }
}

async function handleReviewerAction(action: string) {
  switch (action) {
    case "start":
      startBossReviewer();
      return NextResponse.json({
        success: true,
        message: "审查器已启动",
        reviewer: getBossReviewerStatus(),
      });

    case "stop":
      stopBossReviewer();
      return NextResponse.json({
        success: true,
        message: "审查器已停止",
        reviewer: getBossReviewerStatus(),
      });

    case "trigger":
      const result = await triggerReviewCheck();
      return NextResponse.json({
        success: result.success,
        message: result.success
          ? "手动审查检查完成"
          : "手动审查检查失败",
        result,
        reviewer: getBossReviewerStatus(),
      });

    case "restart":
      stopBossReviewer();
      setTimeout(() => startBossReviewer(), 1000);
      return NextResponse.json({
        success: true,
        message: "审查器已重启",
        reviewer: getBossReviewerStatus(),
      });

    default:
      return NextResponse.json(
        {
          success: false,
          error: `Unknown action: ${action}`,
        },
        { status: 400 }
      );
  }
}
