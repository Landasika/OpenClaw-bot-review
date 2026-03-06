import { NextResponse } from "next/server";
import type { TimelineEntry, TimelineResponse, TimelineQuery } from "@/lib/pixel-office/timeline-types";
import { taskStore } from "@/lib/task-store";
import { formatTimeAgo, TIMELINE_ICONS, TIMELINE_COLORS, TIMELINE_TITLES } from "@/lib/pixel-office/timeline-config";
import type { TimelineEventType } from "@/lib/pixel-office/timeline-types";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Agent 信息缓存
 */
interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
}

let agentInfoCache: Map<string, AgentInfo> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * 从配置文件加载 Agent 信息
 */
async function loadAgentInfo(): Promise<Map<string, AgentInfo>> {
  const now = Date.now();
  if (agentInfoCache && cacheTimestamp && now - cacheTimestamp < CACHE_TTL) {
    return agentInfoCache;
  }

  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const openclawDir = path.join(os.homedir(), '.openclaw');
  const configPath = path.join(openclawDir, 'openclaw.json');

  const agentMap = new Map<string, AgentInfo>();

  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);

    const agentList = Array.isArray(config.agents) ? config.agents : config.agents?.list;
    if (agentList && Array.isArray(agentList)) {
      for (const agent of agentList) {
        agentMap.set(agent.id, {
          id: agent.id,
          name: agent.name || agent.id,
          emoji: agent.identity?.emoji || agent.emoji || '🤖',
        });
      }
    }

    agentInfoCache = agentMap;
    cacheTimestamp = now;
  } catch (error) {
    console.error('Error loading agent info:', error);
  }

  return agentMap;
}

/**
 * 从任务创建时间线条目
 */
function createEntriesFromTask(task: any, agentMap: Map<string, AgentInfo>): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const now = Date.now();

  // 获取 Agent 信息
  const getAgent = (id?: string) => {
    if (!id) return undefined;
    return agentMap.get(id) || { id, name: id, emoji: '🤖' };
  };

  const createdBy = getAgent(task.createdBy);
  const assignedTo = getAgent(task.assignedTo);
  const reviewedBy = getAgent(task.reviewedBy);

  // 1. 任务创建
  entries.push({
    id: `${task.id}_created`,
    timestamp: task.createdAt,
    timeAgo: formatTimeAgo(task.createdAt),
    agentId: createdBy?.id || task.createdBy,
    agentName: createdBy?.name || task.createdBy,
    agentEmoji: createdBy?.emoji || '🤖',
    type: 'task_created',
    icon: TIMELINE_ICONS.task_created,
    title: TIMELINE_TITLES.task_created,
    description: task.title || '无标题',
    taskId: task.id,
  });

  // 2. 任务分配
  if (task.assignedTo && assignedTo) {
    entries.push({
      id: `${task.id}_assigned`,
      timestamp: task.createdAt + 1, // 略晚于创建时间
      timeAgo: formatTimeAgo(task.createdAt + 1),
      agentId: createdBy?.id || task.createdBy,
      agentName: createdBy?.name || task.createdBy,
      agentEmoji: createdBy?.emoji || '🤖',
      type: 'task_assigned',
      icon: TIMELINE_ICONS.task_assigned,
      title: TIMELINE_TITLES.task_assigned,
      description: task.title || '无标题',
      relatedAgentId: assignedTo.id,
      relatedAgentName: assignedTo.name,
      relatedAgentEmoji: assignedTo.emoji,
      taskId: task.id,
    });
  }

  // 3. 任务开始
  if (task.startedAt) {
    entries.push({
      id: `${task.id}_started`,
      timestamp: task.startedAt,
      timeAgo: formatTimeAgo(task.startedAt),
      agentId: assignedTo?.id || task.assignedTo || 'unknown',
      agentName: assignedTo?.name || task.assignedTo || 'Unknown',
      agentEmoji: assignedTo?.emoji || '🤖',
      type: 'task_started',
      icon: TIMELINE_ICONS.task_started,
      title: TIMELINE_TITLES.task_started,
      description: task.title || '无标题',
      taskId: task.id,
    });
  }

  // 4. 任务完成
  if (task.completedAt) {
    entries.push({
      id: `${task.id}_completed`,
      timestamp: task.completedAt,
      timeAgo: formatTimeAgo(task.completedAt),
      agentId: assignedTo?.id || task.assignedTo || 'unknown',
      agentName: assignedTo?.name || task.assignedTo || 'Unknown',
      agentEmoji: assignedTo?.emoji || '🤖',
      type: 'task_completed',
      icon: TIMELINE_ICONS.task_completed,
      title: TIMELINE_TITLES.task_completed,
      description: task.title || '无标题',
      taskId: task.id,
    });
  }

  // 5. 审批结果
  if (task.reviewedAt && task.status === 'approved' && reviewedBy) {
    entries.push({
      id: `${task.id}_approved`,
      timestamp: task.reviewedAt,
      timeAgo: formatTimeAgo(task.reviewedAt),
      agentId: reviewedBy.id,
      agentName: reviewedBy.name,
      agentEmoji: reviewedBy.emoji,
      type: 'task_approved',
      icon: TIMELINE_ICONS.task_approved,
      title: TIMELINE_TITLES.task_approved,
      description: task.title || '无标题',
      relatedAgentId: assignedTo?.id,
      relatedAgentName: assignedTo?.name,
      relatedAgentEmoji: assignedTo?.emoji,
      taskId: task.id,
    });
  } else if (task.reviewedAt && task.status === 'rejected' && reviewedBy) {
    entries.push({
      id: `${task.id}_rejected`,
      timestamp: task.reviewedAt,
      timeAgo: formatTimeAgo(task.reviewedAt),
      agentId: reviewedBy.id,
      agentName: reviewedBy.name,
      agentEmoji: reviewedBy.emoji,
      type: 'task_rejected',
      icon: TIMELINE_ICONS.task_rejected,
      title: TIMELINE_TITLES.task_rejected,
      description: task.title || '无标题',
      relatedAgentId: assignedTo?.id,
      relatedAgentName: assignedTo?.name,
      relatedAgentEmoji: assignedTo?.emoji,
      taskId: task.id,
    });
  }

  return entries;
}

// GET /api/task-timeline - 获取任务时间线
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const beforeTimestamp = searchParams.get('beforeTimestamp');
    const agentId = searchParams.get('agentId') || undefined;

    // 加载 Agent 信息
    const agentMap = await loadAgentInfo();

    // 获取所有任务
    const allTasks = await taskStore.listTasks();

    // 创建时间线条目
    let allEntries: TimelineEntry[] = [];
    for (const task of allTasks) {
      const entries = createEntriesFromTask(task, agentMap);

      // 如果指定了 agentId，只显示相关条目
      if (agentId) {
        const filtered = entries.filter(e =>
          e.agentId === agentId || e.relatedAgentId === agentId
        );
        allEntries.push(...filtered);
      } else {
        allEntries.push(...entries);
      }
    }

    // 按时间戳倒序排序
    allEntries.sort((a, b) => b.timestamp - a.timestamp);

    // 应用时间过滤
    if (beforeTimestamp) {
      const before = parseInt(beforeTimestamp);
      allEntries = allEntries.filter(e => e.timestamp < before);
    }

    // 应用限制
    const hasMore = allEntries.length > limit;
    const entries = allEntries.slice(0, limit);
    const lastTimestamp = entries.length > 0
      ? entries[entries.length - 1].timestamp
      : Date.now();

    const response: TimelineResponse = {
      success: true,
      entries,
      hasMore,
      lastTimestamp,
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('Error in task timeline API:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
