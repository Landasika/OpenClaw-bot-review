import { NextResponse } from "next/server";
import { taskStore } from "@/lib/task-store";
import {
  dispatchTaskToAgent,
  autoDispatchPendingTasks,
} from "@/lib/task-scheduler";
import { getSystemConfig } from "@/lib/system-config";
import {
  evaluateTaskDependencies,
  loadTaskMap,
} from "@/lib/task-dependency";

// POST /api/tasks/dispatch - 调度单个任务
export async function POST(req: Request) {
  try {
    const systemConfig = getSystemConfig();
    const body = await req.json();
    const { taskId, autoDispatch = false } = body;

    // 自动调度模式
    if (autoDispatch) {
      const result = await autoDispatchPendingTasks(body.limit || 5);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // 手动调度单个任务
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "Missing taskId" },
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

    if (!task.assignedTo) {
      return NextResponse.json(
        { success: false, error: "Task not assigned to any agent" },
        { status: 400 }
      );
    }

    const taskMap = await loadTaskMap();
    taskMap.set(task.id, task);

    if (task.status === "blocked") {
      const dependencyCheck = evaluateTaskDependencies(task, taskMap);
      if (!dependencyCheck.satisfied) {
        return NextResponse.json(
          {
            success: false,
            error: task.blockedReason || dependencyCheck.blockedReason || "Task is blocked by dependencies",
          },
          { status: 400 }
        );
      }

      await taskStore.updateTask(task.id, {
        status: "assigned",
        blockedReason: undefined,
      });
      task.status = "assigned";
    }

    if (task.status !== "assigned") {
      return NextResponse.json(
        {
          success: false,
          error: `Task status is ${task.status}, cannot dispatch`
        },
        { status: 400 }
      );
    }

    const dependencyCheck = evaluateTaskDependencies(task, taskMap);
    if (!dependencyCheck.satisfied) {
      await taskStore.updateTask(task.id, {
        status: "blocked",
        blockedReason: dependencyCheck.blockedReason,
      });

      return NextResponse.json(
        {
          success: false,
          error: dependencyCheck.blockedReason,
        },
        { status: 400 }
      );
    }

    // 调度任务（支持等待空闲）
    const result = await dispatchTaskToAgent(
      taskId,
      task.assignedTo,
      `任务: ${task.title}\n\n${task.description}`,
      {
        waitForIdle: body.waitForIdle !== false,
        maxWait: body.maxWait || systemConfig.taskDispatchWaitForIdleMaxSeconds * 1000,
        checkInterval: body.checkInterval || systemConfig.taskDispatchWaitCheckIntervalSeconds * 1000,
      }
    );

    return NextResponse.json({
      success: result.success,
      task: await taskStore.getTask(taskId),
      dispatch: result,
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// GET /api/tasks/dispatch - 获取调度状态
export async function GET() {
  try {
    // 获取待调度的任务统计
    const assignedTasks = await taskStore.listTasks({ status: "assigned" });
    const blockedTasks = await taskStore.listTasks({ status: "blocked" });
    const inProgressTasks = await taskStore.listTasks({ status: "in_progress" });

    return NextResponse.json({
      success: true,
      stats: {
        pending: assignedTasks.length,
        blocked: blockedTasks.length,
        inProgress: inProgressTasks.length,
      },
      pendingTasks: assignedTasks.map(t => ({
        id: t.id,
        title: t.title,
        assignedTo: t.assignedTo,
        priority: t.priority,
        createdAt: t.createdAt,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
