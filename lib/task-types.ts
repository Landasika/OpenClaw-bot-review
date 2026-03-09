/**
 * 任务管理系统数据类型定义
 */

export type TaskStatus = "pending" | "assigned" | "blocked" | "in_progress" | "submitted" | "approved" | "rejected" | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskAcceptanceChecklistStatus = "done" | "partial" | "not_done";

export interface TaskAcceptanceChecklistItem {
  criterion: string;
  status: TaskAcceptanceChecklistStatus;
  evidence: string;
}

export interface TaskResultDetails {
  summary: string;
  implementation: string;
  verification: string;
  risks: string;
  acceptanceChecklist: TaskAcceptanceChecklistItem[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
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
  resultDetails?: TaskResultDetails;
  attachments?: string[]; // 结果附件URL

  // 审查相关
  reviewedBy?: string; // Boss agent ID
  reviewedAt?: number;
  reviewComment?: string; // Boss的审查意见
  reviewScore?: number; // 1-5分

  // 任务关联
  dependsOnTaskIds?: string[]; // 任务依赖：只有依赖任务全部 approved 才可执行
  blockedReason?: string; // 当状态为 blocked 时，记录阻塞原因
  relatedTaskId?: string; // 关联的其他任务

  // 元数据
  tags?: string[];
  estimatedHours?: number;
  actualHours?: number;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  assignedTo?: string;
  dueDate?: number;
  tags?: string[];
  estimatedHours?: number;
  dependsOnTaskIds?: string[];
}

export interface AssignTaskRequest {
  taskId: string;
  assignedTo: string;
}

export interface UpdateTaskResultRequest {
  taskId: string;
  summary: string;
  implementation: string;
  verification: string;
  risks: string;
  acceptanceChecklist: TaskAcceptanceChecklistItem[];
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
  dependsOnTaskId?: string;
  priority?: TaskPriority;
  limit?: number;
  offset?: number;
}
