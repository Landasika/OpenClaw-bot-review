/**
 * 任务存储管理器
 * 使用JSON文件持久化存储任务数据
 */

import fs from "fs";
import * as FeishuNotifier from "./feishu-notifier";
import path from "path";
import type { Task, TaskStatus } from "./task-types";

const PROJECT_ROOT = process.cwd();
const TASKS_INDEX_FILE = path.join(PROJECT_ROOT, "data", "task.json");
const TASKS_DIR = path.dirname(TASKS_INDEX_FILE);
const LEGACY_TASKS_INDEX_FILES = [
  path.join(PROJECT_ROOT, "data", "tasks", "tasks.json"),
  path.join(process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw"), "tasks", "tasks.json"),
];

export class TaskStore {
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
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private saveIndex(index: Record<string, Task>) {
    this.ensureDirs();
    fs.writeFileSync(TASKS_INDEX_FILE, JSON.stringify(index, null, 2));
  }

  generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async createTask(task: Task): Promise<Task> {
    const index = this.getIndex();
    index[task.id] = task;
    this.saveIndex(index);

    // 如果任务被分配，通知员工
    if (task.assignedTo && task.status === "assigned") {
      FeishuNotifier.notifyTaskAssigned(
        task.id,
        task.title,
        task.description,
        task.assignedTo
      ).catch(err => console.error("[Feishu] 通知失败:", err));
    }

    return task;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const index = this.getIndex();
    return index[taskId] || null;
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    const index = this.getIndex();
    const task = index[taskId];
    if (!task) return null;

    const updated = {
      ...task,
      ...updates,
      updatedAt: Date.now(),
    };
    index[taskId] = updated;
    this.saveIndex(index);
    return updated;
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
      if (filter.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (filter.assignedTo) {
        tasks = tasks.filter(t => t.assignedTo === filter.assignedTo);
      }
      if (filter.createdBy) {
        tasks = tasks.filter(t => t.createdBy === filter.createdBy);
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
    const index = this.getIndex();
    if (!index[taskId]) return false;

    delete index[taskId];
    this.saveIndex(index);
    return true;
  }

  async getTasksByAgent(agentId: string): Promise<{
    created: Task[];
    assigned: Task[];
  }> {
    const allTasks = await this.listTasks();
    return {
      created: allTasks.filter(t => t.createdBy === agentId),
      assigned: allTasks.filter(t => t.assignedTo === agentId),
    };
  }
}

export const taskStore = new TaskStore();
