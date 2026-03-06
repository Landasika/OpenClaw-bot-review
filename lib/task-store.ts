/**
 * 任务存储管理器
 * 使用JSON文件持久化存储任务数据
 */

import fs from "fs";
import * as FeishuNotifier from "./feishu-notifier";
import path from "path";
import type { Task, TaskStatus } from "./task-types";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const TASKS_DIR = path.join(OPENCLAW_HOME, "tasks");
const TASKS_INDEX_FILE = path.join(TASKS_DIR, "tasks.json");

export class TaskStore {
  private ensureDirs() {
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
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
    parentTaskId?: string;
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
      if (filter.parentTaskId !== undefined) {
        tasks = tasks.filter(t => t.parentTaskId === filter.parentTaskId);
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
