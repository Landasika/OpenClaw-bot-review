/**
 * 任务时间线配置和常量
 */

import type { TimelineEventType } from './timeline-types'

export const TIMELINE_ICONS: Record<TimelineEventType, string> = {
  task_created: '⚡',      // 创建任务
  task_assigned: '📋',     // 分配任务
  task_started: '🔨',      // 开始执行
  task_completed: '✅',    // 完成任务
  task_approved: '👍',     // 审批通过
  task_rejected: '❌',     // 审批拒绝
}

export const TIMELINE_COLORS: Record<TimelineEventType, string> = {
  task_created: '#fbbf24',    // amber
  task_assigned: '#60a5fa',   // blue
  task_started: '#a78bfa',    // purple
  task_completed: '#34d399',  // emerald
  task_approved: '#22c55e',   // green
  task_rejected: '#ef4444',   // red
}

export const TIMELINE_TITLES: Record<TimelineEventType, string> = {
  task_created: '创建任务',
  task_assigned: '分配任务',
  task_started: '开始执行',
  task_completed: '完成任务',
  task_approved: '审批通过',
  task_rejected: '审批拒绝',
}

/**
 * 格式化时间戳为相对时间字符串
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

/**
 * 自动刷新间隔（毫秒）
 */
export const AUTO_REFRESH_INTERVAL = 30000 // 30 seconds

/**
 * 默认查询限制
 */
export const DEFAULT_LIMIT = 50
