import { NextResponse } from "next/server";
import {
  deleteEpicProject,
  getEpicProject,
  getEpicRuntimeState,
  updateEpicProject,
} from "@/lib/epic-loop-service";
import type { EpicBoundTask } from "@/lib/epic-types";
import { taskStore } from "@/lib/task-store";

async function buildBoundTasks(taskBindings: Record<string, string>): Promise<EpicBoundTask[]> {
  const entries = Object.entries(taskBindings || {});
  if (entries.length === 0) {
    return [];
  }

  const boundTasks = await Promise.all(
    entries.map(async ([externalKey, taskId]) => {
      const task = await taskStore.getTask(taskId);
      if (!task) {
        return {
          externalKey,
          taskId,
          exists: false,
          status: "missing",
          dependsOnTaskIds: [],
          dependencyStatuses: [],
        } satisfies EpicBoundTask;
      }

      const dependsOnTaskIds = task.dependsOnTaskIds || [];
      const dependencyStatuses: EpicBoundTask["dependencyStatuses"] = await Promise.all(
        dependsOnTaskIds.map(async (dependencyTaskId) => {
          const dependencyTask = await taskStore.getTask(dependencyTaskId);
          return {
            taskId: dependencyTaskId,
            status: dependencyTask ? dependencyTask.status : "missing",
          };
        })
      );

      return {
        externalKey,
        taskId: task.id,
        exists: true,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedTo,
        dependsOnTaskIds,
        dependencyStatuses,
        updatedAt: task.updatedAt,
      } satisfies EpicBoundTask;
    })
  );

  return boundTasks;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const epic = await getEpicProject(id);
    if (!epic) {
      return NextResponse.json(
        { success: false, error: "大任务不存在" },
        { status: 404 }
      );
    }

    const boundTasks = await buildBoundTasks(epic.taskBindings);

    return NextResponse.json({
      success: true,
      epic: {
        ...epic,
        boundTasks,
        runtime: getEpicRuntimeState(epic.id),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "读取大任务失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string") {
      patch.title = body.title.trim();
    }
    if (typeof body.frameworkPrompt === "string") {
      patch.frameworkPrompt = body.frameworkPrompt.trim();
    }
    if (typeof body.objective === "string") {
      patch.objective = body.objective.trim();
    }
    if (typeof body.successCriteria === "string") {
      patch.successCriteria = body.successCriteria.trim();
    }
    if (typeof body.ownerAgentId === "string") {
      patch.ownerAgentId = body.ownerAgentId;
    }
    if (Number.isFinite(body.loopIntervalSeconds)) {
      patch.loopIntervalSeconds = Math.max(10, Math.floor(Number(body.loopIntervalSeconds)));
    }
    if (body.durationLimitMs === null || body.durationLimitMs === undefined) {
      patch.durationLimitMs = null;
    } else if (Number.isFinite(body.durationLimitMs)) {
      patch.durationLimitMs = Math.max(1, Math.floor(Number(body.durationLimitMs)));
    }
    if (body.callLimitTotal === null || body.callLimitTotal === undefined) {
      patch.callLimitTotal = null;
    } else if (Number.isFinite(body.callLimitTotal)) {
      patch.callLimitTotal = Math.max(1, Math.floor(Number(body.callLimitTotal)));
    }
    if (body.promptFiles && typeof body.promptFiles === "object") {
      patch.promptFiles = body.promptFiles;
    }

    const epic = await updateEpicProject(id, patch as any);
    if (!epic) {
      return NextResponse.json(
        { success: false, error: "大任务不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      epic: {
        ...epic,
        runtime: getEpicRuntimeState(epic.id),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "更新大任务失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteEpicProject(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "大任务不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "大任务已删除",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "删除大任务失败" },
      { status: 500 }
    );
  }
}
