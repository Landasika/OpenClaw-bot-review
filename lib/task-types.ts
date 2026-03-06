/**
 * 任务管理系统数据类型定义
 */

export type TaskStatus = "pending" | "assigned" | "in_progress" | "submitted" | "approved" | "rejected" | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string; // 员工agent ID
  createdBy: string; // Boss agent ID
  createdAt: number;
  updatedAt: number;
  dueDate?: number;

  // 执行相关
  startedAt?: number;
  completedAt?: number;
  result?: string; // 员工填写的结果
  attachments?: string[]; // 结果附件URL

  // 审查相关
  reviewedBy?: string; // Boss agent ID
  reviewedAt?: number;
  reviewComment?: string; // Boss的审查意见
  reviewScore?: number; // 1-5分

  // 任务关联
  parentTaskId?: string; // 如果是因任务未完成而创建的子任务
  relatedTaskId?: string; // 关联的其他任务

  // 元数据
  tags?: string[];
  estimatedHours?: number;
  actualHours?: number;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  priority?: TaskPriority;
  assignedTo?: string;
  dueDate?: number;
  tags?: string[];
  estimatedHours?: number;
  parentTaskId?: string;
}

export interface AssignTaskRequest {
  taskId: string;
  assignedTo: string;
}

export interface UpdateTaskResultRequest {
  taskId: string;
  result: string;
  attachments?: string[];
  actualHours?: number;
}

export interface ReviewTaskRequest {
  taskId: string;
  approved: boolean;
  comment?: string;
  score?: number;
  createFollowUpTask?: boolean;
  followUpTaskTitle?: string;
  followUpTaskDescription?: string;
}

export interface TaskListQuery {
  status?: TaskStatus;
  assignedTo?: string;
  createdBy?: string;
  priority?: TaskPriority;
  limit?: number;
  offset?: number;
}
