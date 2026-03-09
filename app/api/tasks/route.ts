import { NextResponse } from "next/server";
import type { CreateTaskRequest, TaskListQuery, TaskStatus } from "@/lib/task-types";
import { taskStore } from "@/lib/task-store";
import { dispatchTaskToAgent } from "@/lib/task-scheduler";
import { getDefaultAgentId } from "@/lib/system-config";
import { normalizeAgentId } from "@/lib/agent-id";
import {
  assertTaskDependenciesValid,
  loadTaskMap,
  normalizeDependsOnTaskIds,
  resolveAssignmentStateByDependencies,
} from "@/lib/task-dependency";

// GET /api/tasks - 查询任务列表
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as any;
    const assignedTo = normalizeAgentId(searchParams.get("assignedTo") || undefined) || undefined;
    const createdBy = normalizeAgentId(searchParams.get("createdBy") || undefined) || undefined;
    const dependsOnTaskId = searchParams.get("dependsOnTaskId") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    const filter: any = {};
    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (createdBy) filter.createdBy = createdBy;
    if (dependsOnTaskId) filter.dependsOnTaskId = dependsOnTaskId;

    let tasks = await taskStore.listTasks(filter);

    if (limit) {
      tasks = tasks.slice(0, limit);
    }

    return NextResponse.json({
      success: true,
      tasks,
      total: tasks.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// POST /api/tasks - 创建新任务（可选自动调度）
export async function POST(req: Request) {
  try {
    const defaultAgentId = getDefaultAgentId();
    const body: CreateTaskRequest & { autoDispatch?: boolean } = await req.json();
    const acceptanceCriteria = typeof body.acceptanceCriteria === "string"
      ? body.acceptanceCriteria.trim()
      : "";

    // 验证必填字段
    if (!body.title || !body.description || !acceptanceCriteria) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: title, description, acceptanceCriteria" },
        { status: 400 }
      );
    }

    if ((body as any).parentTaskId !== undefined) {
      return NextResponse.json(
        { success: false, error: "parentTaskId 已弃用，请使用 dependsOnTaskIds" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const taskId = taskStore.generateId();
    const assignedTo = normalizeAgentId(
      typeof body.assignedTo === "string" ? body.assignedTo.trim() : undefined
    ) || undefined;
    const dependsOnTaskIds = normalizeDependsOnTaskIds(body.dependsOnTaskIds);
    const taskMap = await loadTaskMap();
    assertTaskDependenciesValid(taskId, dependsOnTaskIds, taskMap);

    let status: TaskStatus = "pending";
    let blockedReason: string | undefined;
    if (assignedTo) {
      const resolved = resolveAssignmentStateByDependencies(
        { dependsOnTaskIds },
        taskMap
      );
      status = resolved.status;
      blockedReason = resolved.blockedReason;
    }

    const task = await taskStore.createTask({
      id: taskId,
      title: body.title,
      description: body.description,
      acceptanceCriteria,
      status,
      priority: body.priority || "medium",
      assignedTo,
      createdBy: defaultAgentId,
      createdAt: now,
      updatedAt: now,
      dueDate: body.dueDate,
      tags: body.tags || [],
      estimatedHours: body.estimatedHours,
      dependsOnTaskIds,
      blockedReason,
    });

    // 如果分配了员工且要求自动调度
    if (assignedTo && body.autoDispatch === true && task.status === "assigned") {
      // 异步调度，不阻塞响应
      dispatchTaskToAgent(
        task.id,
        assignedTo,
        `任务: ${task.title}\n\n${task.description}`
      ).catch(err => {
        console.error(`自动调度失败:`, err);
      });

      return NextResponse.json({
        success: true,
        task,
        dispatched: true,
        message: "任务已创建并自动调度执行",
      });
    }

    return NextResponse.json({
      success: true,
      task,
      message: task.status === "blocked" ? task.blockedReason : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
