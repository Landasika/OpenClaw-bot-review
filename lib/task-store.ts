/**
 * 任务存储管理器
 * 使用JSON文件持久化存储任务数据
 */

import fs from "fs";
import * as FeishuNotifier from "./feishu-notifier";
import path from "path";
import type { Task, TaskStatus } from "./task-types";
import { normalizeAgentId } from "./agent-id";

const PROJECT_ROOT = process.cwd();
const TASKS_INDEX_FILE = path.join(PROJECT_ROOT, "data", "task.json");
const TASKS_DIR = path.dirname(TASKS_INDEX_FILE);
const LEGACY_TASKS_INDEX_FILES = [
  path.join(PROJECT_ROOT, "data", "tasks", "tasks.json"),
  path.join(process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw"), "tasks", "tasks.json"),
];

export class TaskStore {
  private writeQueue: Promise<void> = Promise.resolve();

  private ensureDirs() {
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
    }
    this.migrateLegacyFileIfNeeded();
  }

  private migrateLegacyFileIfNeeded() {
    // If the repository task file is empty/missing but legacy file exists, copy once.
    const targetExists = fs.existsSync(TASKS_INDEX_FILE);
    const targetSize = targetExists ? fs.statSync(TASKS_INDEX_FILE).size : 0;
    if (targetExists && targetSize > 0) {
      return;
    }
    for (const legacyFile of LEGACY_TASKS_INDEX_FILES) {
      if (!fs.existsSync(legacyFile)) {
        continue;
      }
      try {
        const raw = fs.readFileSync(legacyFile, "utf-8");
        if (!raw.trim()) {
          continue;
        }
        JSON.parse(raw);
        fs.writeFileSync(TASKS_INDEX_FILE, raw);
        return;
      } catch {
        // try next legacy file
      }
    }
  }

  private getIndex(): Record<string, Task> {
    this.ensureDirs();
    if (!fs.existsSync(TASKS_INDEX_FILE)) {
      return {};
    }
    try {
      const raw = fs.readFileSync(TASKS_INDEX_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      const index = parsed as Record<string, Task>;
      let changed = false;
      for (const [taskId, task] of Object.entries(index)) {
        if (!task || typeof task !== "object") continue;
        const normalizedTask = this.normalizeTaskAgentIds(task as Task);
        if (normalizedTask.changed) {
          index[taskId] = normalizedTask.task;
          changed = true;
        }
      }

      return index;
    } catch {
      return {};
    }
  }

  private async withWriteLock<T>(work: () => T | Promise<T>): Promise<T> {
    const run = this.writeQueue.then(() => work());
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private saveIndex(index: Record<string, Task>) {
    this.ensureDirs();
    fs.writeFileSync(TASKS_INDEX_FILE, JSON.stringify(index, null, 2));
  }

  generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private normalizeTaskAgentIds(task: Task): { task: Task; changed: boolean } {
    let changed = false;
    const next: Task = { ...task };

    if (typeof next.assignedTo === "string") {
      const normalizedAssignedTo = normalizeAgentId(next.assignedTo);
      const finalAssignedTo = normalizedAssignedTo || undefined;
      if (next.assignedTo !== finalAssignedTo) {
        if (finalAssignedTo) next.assignedTo = finalAssignedTo;
        else delete next.assignedTo;
        changed = true;
      }
    }

    if (typeof next.createdBy === "string") {
      const normalizedCreatedBy = normalizeAgentId(next.createdBy) || next.createdBy;
      if (next.createdBy !== normalizedCreatedBy) {
        next.createdBy = normalizedCreatedBy;
        changed = true;
      }
    }

    return { task: next, changed };
  }

  async createTask(task: Task): Promise<Task> {
    const normalizedTask = await this.withWriteLock(() => {
      const index = this.getIndex();
      const nextTask = this.normalizeTaskAgentIds(task).task;
      index[nextTask.id] = nextTask;
      this.saveIndex(index);
      return nextTask;
    });

    // 如果任务被分配，通知员工
    if (normalizedTask.assignedTo && normalizedTask.status === "assigned") {
      FeishuNotifier.notifyTaskAssigned(
        normalizedTask.id,
        normalizedTask.title,
        normalizedTask.description,
        normalizedTask.assignedTo
      ).catch(err => console.error("[Feishu] 通知失败:", err));
    }

    return normalizedTask;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const index = this.getIndex();
    return index[taskId] || null;
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    return this.withWriteLock(() => {
      const index = this.getIndex();
      const task = index[taskId];
      if (!task) return null;

      const normalizedUpdates: Partial<Task> = { ...updates };
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, "assignedTo")) {
        normalizedUpdates.assignedTo = normalizeAgentId(normalizedUpdates.assignedTo as string | undefined);
      }
      if (typeof normalizedUpdates.createdBy === "string") {
        normalizedUpdates.createdBy = normalizeAgentId(normalizedUpdates.createdBy) || normalizedUpdates.createdBy;
      }

      const updated = {
        ...task,
        ...normalizedUpdates,
        updatedAt: Date.now(),
      };
      index[taskId] = this.normalizeTaskAgentIds(updated).task;
      this.saveIndex(index);
      return index[taskId];
    });
  }

  async updateTaskIf(
    taskId: string,
    predicate: (task: Task) => boolean,
    updates: Partial<Task> | ((task: Task) => Partial<Task>)
  ): Promise<{ applied: boolean; task: Task | null; current: Task | null }> {
    return this.withWriteLock(() => {
      const index = this.getIndex();
      const current = index[taskId] || null;
      if (!current) {
        return { applied: false, task: null, current: null };
      }

      if (!predicate(current)) {
        return { applied: false, task: current, current };
      }

      const rawUpdates = typeof updates === "function" ? updates(current) : updates;
      const normalizedUpdates: Partial<Task> = { ...rawUpdates };
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, "assignedTo")) {
        normalizedUpdates.assignedTo = normalizeAgentId(normalizedUpdates.assignedTo as string | undefined);
      }
      if (typeof normalizedUpdates.createdBy === "string") {
        normalizedUpdates.createdBy = normalizeAgentId(normalizedUpdates.createdBy) || normalizedUpdates.createdBy;
      }

      const next = {
        ...current,
        ...normalizedUpdates,
        updatedAt: Date.now(),
      };
      index[taskId] = this.normalizeTaskAgentIds(next).task;
      this.saveIndex(index);

      return {
        applied: true,
        task: index[taskId],
        current: index[taskId],
      };
    });
  }

  async listTasks(filter?: {
    status?: TaskStatus;
    assignedTo?: string;
    createdBy?: string;
    dependsOnTaskId?: string;
  }): Promise<Task[]> {
    const index = this.getIndex();
    let tasks = Object.values(index);

    if (filter) {
      const assignedTo = normalizeAgentId(filter.assignedTo) || filter.assignedTo;
      const createdBy = normalizeAgentId(filter.createdBy) || filter.createdBy;
      if (filter.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (assignedTo) {
        tasks = tasks.filter(t => t.assignedTo === assignedTo);
      }
      if (createdBy) {
        tasks = tasks.filter(t => t.createdBy === createdBy);
      }
      const dependsOnTaskId = filter.dependsOnTaskId;
      if (dependsOnTaskId !== undefined) {
        tasks = tasks.filter(t => (t.dependsOnTaskIds || []).includes(dependsOnTaskId));
      }
    }

    // 按创建时间倒序排列
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.withWriteLock(() => {
      const index = this.getIndex();
      if (!index[taskId]) return false;

      delete index[taskId];
      this.saveIndex(index);
      return true;
    });
  }

  async getTasksByAgent(agentId: string): Promise<{
    created: Task[];
    assigned: Task[];
  }> {
    const allTasks = await this.listTasks();
    const normalizedAgentId = normalizeAgentId(agentId) || agentId;
    return {
      created: allTasks.filter(t => t.createdBy === normalizedAgentId),
      assigned: allTasks.filter(t => t.assignedTo === normalizedAgentId),
    };
  }
}

export const taskStore = new TaskStore();
