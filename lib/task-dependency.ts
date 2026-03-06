import { taskStore } from "./task-store";
import type { Task, TaskStatus } from "./task-types";

export interface DependencyBlocker {
  taskId: string;
  title?: string;
  status: TaskStatus | "missing";
}

export interface DependencyCheckResult {
  satisfied: boolean;
  blockers: DependencyBlocker[];
  blockedReason: string;
}

const DEPENDENCY_EDITABLE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "pending",
  "assigned",
  "blocked",
]);

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function normalizeDependsOnTaskIds(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw new Error("dependsOnTaskIds 必须是字符串数组");
  }

  const values = raw.map((item) => {
    if (typeof item !== "string") {
      throw new Error("dependsOnTaskIds 必须是字符串数组");
    }
    const normalized = item.trim();
    if (!normalized) {
      throw new Error("dependsOnTaskIds 不能包含空字符串");
    }
    return normalized;
  });

  return uniqueStrings(values);
}

export function buildTaskMap(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((task) => [task.id, task]));
}

export async function loadTaskMap(): Promise<Map<string, Task>> {
  const tasks = await taskStore.listTasks();
  return buildTaskMap(tasks);
}

function resolveBlockReason(blockers: DependencyBlocker[]): string {
  const missing = blockers.filter((item) => item.status === "missing");
  if (missing.length > 0) {
    return `依赖任务不存在: ${missing.map((item) => item.taskId).join(", ")}`;
  }

  const failed = blockers.filter(
    (item) => item.status === "rejected" || item.status === "cancelled"
  );
  if (failed.length > 0) {
    return `依赖任务未通过: ${failed
      .map((item) => `${item.title || item.taskId}(${item.status})`)
      .join(", ")}`;
  }

  return `等待依赖任务审批通过: ${blockers
    .map((item) => `${item.title || item.taskId}(${item.status})`)
    .join(", ")}`;
}

export function evaluateTaskDependencies(
  task: Pick<Task, "dependsOnTaskIds">,
  taskMap: Map<string, Task>
): DependencyCheckResult {
  const dependsOnTaskIds = task.dependsOnTaskIds || [];
  if (dependsOnTaskIds.length === 0) {
    return {
      satisfied: true,
      blockers: [],
      blockedReason: "",
    };
  }

  const blockers: DependencyBlocker[] = [];

  for (const dependencyId of dependsOnTaskIds) {
    const dependencyTask = taskMap.get(dependencyId);
    if (!dependencyTask) {
      blockers.push({
        taskId: dependencyId,
        status: "missing",
      });
      continue;
    }

    if (dependencyTask.status !== "approved") {
      blockers.push({
        taskId: dependencyTask.id,
        title: dependencyTask.title,
        status: dependencyTask.status,
      });
    }
  }

  if (blockers.length === 0) {
    return {
      satisfied: true,
      blockers: [],
      blockedReason: "",
    };
  }

  return {
    satisfied: false,
    blockers,
    blockedReason: resolveBlockReason(blockers),
  };
}

export function resolveAssignmentStateByDependencies(
  task: Pick<Task, "dependsOnTaskIds">,
  taskMap: Map<string, Task>
): { status: "assigned" | "blocked"; blockedReason?: string } {
  const checkResult = evaluateTaskDependencies(task, taskMap);
  if (checkResult.satisfied) {
    return {
      status: "assigned",
    };
  }

  return {
    status: "blocked",
    blockedReason: checkResult.blockedReason,
  };
}

function hasCycleFrom(
  nodeId: string,
  adjacency: Map<string, string[]>,
  visiting: Set<string>,
  visited: Set<string>
): boolean {
  if (visiting.has(nodeId)) {
    return true;
  }
  if (visited.has(nodeId)) {
    return false;
  }

  visiting.add(nodeId);
  const neighbors = adjacency.get(nodeId) || [];
  for (const dependencyId of neighbors) {
    if (!adjacency.has(dependencyId)) {
      continue;
    }
    if (hasCycleFrom(dependencyId, adjacency, visiting, visited)) {
      return true;
    }
  }

  visiting.delete(nodeId);
  visited.add(nodeId);
  return false;
}

export function assertTaskDependenciesValid(
  taskId: string,
  dependsOnTaskIds: string[],
  taskMap: Map<string, Task>
): void {
  if (dependsOnTaskIds.includes(taskId)) {
    throw new Error("任务不能依赖自己");
  }

  for (const dependencyId of dependsOnTaskIds) {
    if (!taskMap.has(dependencyId)) {
      throw new Error(`依赖任务不存在: ${dependencyId}`);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const [id, task] of taskMap.entries()) {
    adjacency.set(id, task.dependsOnTaskIds || []);
  }
  adjacency.set(taskId, dependsOnTaskIds);

  const hasCycle = hasCycleFrom(taskId, adjacency, new Set<string>(), new Set<string>());
  if (hasCycle) {
    throw new Error("检测到循环依赖，保存失败");
  }
}

export function canEditTaskDependencies(status: TaskStatus): boolean {
  return DEPENDENCY_EDITABLE_STATUSES.has(status);
}
