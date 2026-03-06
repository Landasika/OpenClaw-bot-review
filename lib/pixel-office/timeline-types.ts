/**
 * 任务时间线类型定义
 */

export type TimelineEventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_started'
  | 'task_completed'
  | 'task_approved'
  | 'task_rejected'

export interface TimelineEntry {
  id: string                    // 唯一标识
  timestamp: number             // 时间戳
  timeAgo: string              // "12m ago", "2h ago" 等
  agentId: string              // Agent ID
  agentName: string            // Agent 名称
  agentEmoji: string           // Agent emoji
  type: TimelineEventType      // 事件类型
  icon: string                 // 图标 (⚡, 📋, ✅ 等)
  title: string                // 标题 (如"创建任务")
  description: string          // 描述 (任务标题)
  relatedAgentId?: string      // 相关 Agent ID (用于箭头)
  relatedAgentName?: string    // 相关 Agent 名称
  relatedAgentEmoji?: string   // 相关 Agent emoji
  taskId?: string              // 任务 ID
}

export interface TimelineResponse {
  success: boolean
  entries?: TimelineEntry[]
  hasMore?: boolean
  lastTimestamp?: number
  error?: string
}

export interface TimelineQuery {
  limit?: number
  beforeTimestamp?: number
  agentId?: string
}
