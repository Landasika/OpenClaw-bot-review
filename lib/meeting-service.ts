import { execFile } from "child_process";
import { promisify } from "util";
import { taskStore } from "./task-store";
import { getAgentDisplayName, getDefaultAgentId, getSystemConfig } from "./system-config";
import { meetingStore } from "./meeting-store";
import {
  ensureMeetingPromptFiles,
  readMeetingPrompts,
  renderPromptTemplate,
} from "./meeting-prompts";
import {
  DEFAULT_MEETING_DISCUSSION_STATUSES,
  VALID_MEETING_DISCUSSION_STATUSES,
} from "./meeting-types";
import type {
  MeetingActionItem,
  MeetingPromptFiles,
  MeetingRecord,
  MeetingTaskSnapshot,
} from "./meeting-types";
import type { TaskStatus } from "./task-types";

const execFileAsync = promisify(execFile);

type MeetingServiceConfig = {
  enabled: boolean;
  dailyTime: string;
  timezone: string;
  bossAgentId: string;
  participants: string[];
  discussionStatuses: TaskStatus[];
  promptFiles: MeetingPromptFiles;
};

type AgentInvocationResult = {
  text: string;
  durationMs: number;
};

function isDailyTimeValid(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function buildMeetingConfig(): MeetingServiceConfig {
  const cfg = getSystemConfig();
  const bossAgentId = getDefaultAgentId();
  const fallbackParticipants = cfg.availableAgents.filter((id) => id !== bossAgentId);

  const requestedParticipants = Array.isArray(cfg.meetingParticipants)
    ? cfg.meetingParticipants.filter((id) => typeof id === "string")
    : [];

  const participants = (requestedParticipants.length > 0 ? requestedParticipants : fallbackParticipants)
    .filter((id) => id !== bossAgentId)
    .filter((id) => cfg.availableAgents.includes(id));

  const rawStatuses = Array.isArray(cfg.meetingDiscussionStatuses)
    ? cfg.meetingDiscussionStatuses
    : DEFAULT_MEETING_DISCUSSION_STATUSES;

  const discussionStatuses = rawStatuses.filter((status): status is TaskStatus =>
    VALID_MEETING_DISCUSSION_STATUSES.includes(status)
  );

  const safeStatuses = discussionStatuses.length > 0
    ? discussionStatuses
    : DEFAULT_MEETING_DISCUSSION_STATUSES;

  const promptFiles = ensureMeetingPromptFiles(cfg.meetingPromptFiles);

  return {
    enabled: cfg.meetingEnabled,
    dailyTime: isDailyTimeValid(cfg.meetingDailyTime) ? cfg.meetingDailyTime : "09:30",
    timezone: cfg.meetingTimezone || "Asia/Shanghai",
    bossAgentId,
    participants,
    discussionStatuses: safeStatuses,
    promptFiles,
  };
}

function getNowPartsInTimezone(timezone: string): {
  dateKey: string;
  hhmm: string;
  dateTimeLabel: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  }

  const year = map.year;
  const month = map.month;
  const day = map.day;
  const hour = map.hour;
  const minute = map.minute;
  const second = map.second;

  return {
    dateKey: `${year}-${month}-${day}`,
    hhmm: `${hour}:${minute}`,
    dateTimeLabel: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
  };
}

function formatTaskSnapshot(tasks: MeetingTaskSnapshot[], maxItems = 30): string {
  if (tasks.length === 0) {
    return "- 当前没有符合讨论范围的未完成任务";
  }

  return tasks
    .slice(0, maxItems)
    .map((task) => {
      const owner = task.assignedTo || "未分配";
      const blocked = task.blockedReason ? `，阻塞: ${task.blockedReason}` : "";
      return `- [${task.status}] ${task.id} | ${task.title} | 负责人: ${owner}${blocked}`;
    })
    .join("\n");
}

function buildActionItems(summary: string, tasks: MeetingTaskSnapshot[]): MeetingActionItem[] {
  const actions: MeetingActionItem[] = [];
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (!/^(-|\d+\.)\s+/.test(line)) {
      continue;
    }

    actions.push({
      owner: "team",
      content: line.replace(/^(-|\d+\.)\s+/, ""),
    });

    if (actions.length >= 20) {
      break;
    }
  }

  if (actions.length > 0) {
    return actions;
  }

  const fallback = tasks
    .filter((task) => task.status !== "approved")
    .slice(0, 12)
    .map((task) => ({
      owner: task.assignedTo || "team",
      content: `推进任务 ${task.id}: ${task.title}`,
      relatedTaskId: task.id,
    }));

  return fallback;
}

function parseJsonFromMixedOutput(output: string): any {
  for (let i = 0; i < output.length; i++) {
    if (output[i] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < output.length; j++) {
      const ch = output[j];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === "\"") {
          inString = false;
        }
        continue;
      }

      if (ch === "\"") {
        inString = true;
        continue;
      }

      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = output.slice(i, j + 1).trim();
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("无法从输出中解析 JSON");
}

function pickTextFromAgentOutput(rawOutput: string): string {
  try {
    const parsed = parseJsonFromMixedOutput(rawOutput);
    if (typeof parsed?.result?.payloads?.[0]?.text === "string") {
      return parsed.result.payloads[0].text;
    }
    if (typeof parsed?.summary === "string") {
      return parsed.summary;
    }
    if (typeof parsed?.result === "string") {
      return parsed.result;
    }
    if (typeof parsed?.message === "string") {
      return parsed.message;
    }
  } catch {
    // ignore parse errors, fallback to raw output
  }

  return rawOutput.trim();
}

async function invokeAgent(agentId: string, message: string): Promise<AgentInvocationResult> {
  const start = Date.now();
  const { stdout, stderr } = await execFileAsync(
    "openclaw",
    ["agent", "--agent", agentId, "--message", message, "--json"],
    {
      timeout: 10 * 60 * 1000,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
    }
  );

  const combined = `${String(stdout)}\n${String(stderr || "")}`;
  const text = pickTextFromAgentOutput(combined);
  return {
    text,
    durationMs: Date.now() - start,
  };
}

// 会议服务状态
let meetingConfig = buildMeetingConfig();
let meetingInterval: NodeJS.Timeout | null = null;
let isMeetingRunning = false;
let meetingCount = 0;
let lastMeetingTime = 0;
let meetingErrorCount = 0;
let lastMeetingError = "";
let lastScheduledDateKey = "";

async function runMeeting(trigger: "manual" | "scheduled"): Promise<{
  success: boolean;
  meetingId?: string;
  error?: string;
}> {
  if (isMeetingRunning) {
    return {
      success: false,
      error: "会议正在进行中，请稍后再试",
    };
  }

  isMeetingRunning = true;

  let meetingRecord: MeetingRecord | null = null;
  try {
    meetingConfig = buildMeetingConfig();

    if (!meetingConfig.enabled && trigger === "scheduled") {
      return {
        success: false,
        error: "会议服务已禁用",
      };
    }

    if (meetingConfig.participants.length === 0) {
      return {
        success: false,
        error: "没有可用参会员工，请先配置 meetingParticipants",
      };
    }

    const nowParts = getNowPartsInTimezone(meetingConfig.timezone);
    const { files: promptFiles, prompts } = readMeetingPrompts(meetingConfig.promptFiles);

    const allTasks = await taskStore.listTasks();
    const discussionStatusSet = new Set(meetingConfig.discussionStatuses);
    const taskSnapshot: MeetingTaskSnapshot[] = allTasks
      .filter((task) => discussionStatusSet.has(task.status))
      .slice(0, 120)
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedTo,
        blockedReason: task.blockedReason,
        updatedAt: task.updatedAt,
      }));

    meetingRecord = await meetingStore.createMeeting({
      trigger,
      bossAgentId: meetingConfig.bossAgentId,
      participants: meetingConfig.participants,
      discussionStatuses: meetingConfig.discussionStatuses,
      taskSnapshot,
      promptFiles,
      scheduledForDate: trigger === "scheduled" ? nowParts.dateKey : undefined,
    });

    const errors: string[] = [];

    const kickoffMessage = renderPromptTemplate(prompts.kickoff, {
      bossAgentId: meetingConfig.bossAgentId,
      participants: meetingConfig.participants.join(", "),
      incompleteTaskCount: taskSnapshot.length,
      today: nowParts.dateTimeLabel,
    });

    try {
      const kickoffResult = await invokeAgent(meetingConfig.bossAgentId, kickoffMessage);
      await meetingStore.appendSpeakerNote(meetingRecord.id, {
        agentId: meetingConfig.bossAgentId,
        agentName: getAgentDisplayName(meetingConfig.bossAgentId),
        role: "boss",
        content: kickoffResult.text,
        durationMs: kickoffResult.durationMs,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      const errorMessage = `[开场失败] ${error?.message || String(error)}`;
      errors.push(errorMessage);
      await meetingStore.appendSpeakerNote(meetingRecord.id, {
        agentId: meetingConfig.bossAgentId,
        agentName: getAgentDisplayName(meetingConfig.bossAgentId),
        role: "boss",
        content: "",
        timestamp: Date.now(),
        error: errorMessage,
      });
    }

    const employeeSummaryBlocks: string[] = [];

    for (const agentId of meetingConfig.participants) {
      const employeeMessage = renderPromptTemplate(prompts.employee, {
        bossAgentId: meetingConfig.bossAgentId,
        agentId,
        today: nowParts.dateTimeLabel,
        incompleteTasks: formatTaskSnapshot(taskSnapshot),
      });

      try {
        const response = await invokeAgent(agentId, employeeMessage);
        const displayName = getAgentDisplayName(agentId);
        await meetingStore.appendSpeakerNote(meetingRecord.id, {
          agentId,
          agentName: displayName,
          role: "employee",
          content: response.text,
          durationMs: response.durationMs,
          timestamp: Date.now(),
        });
        employeeSummaryBlocks.push(`${displayName}(${agentId}):\n${response.text}`);
      } catch (error: any) {
        const errorMessage = `[员工发言失败 ${agentId}] ${error?.message || String(error)}`;
        errors.push(errorMessage);
        await meetingStore.appendSpeakerNote(meetingRecord.id, {
          agentId,
          agentName: getAgentDisplayName(agentId),
          role: "employee",
          content: "",
          timestamp: Date.now(),
          error: errorMessage,
        });
      }
    }

    const summaryMessage = renderPromptTemplate(prompts.summary, {
      bossAgentId: meetingConfig.bossAgentId,
      participants: meetingConfig.participants.join(", "),
      today: nowParts.dateTimeLabel,
      employeeNotes: employeeSummaryBlocks.join("\n\n"),
    });

    let bossSummary = "";
    try {
      const summary = await invokeAgent(meetingConfig.bossAgentId, summaryMessage);
      bossSummary = summary.text;
      await meetingStore.appendSpeakerNote(meetingRecord.id, {
        agentId: meetingConfig.bossAgentId,
        agentName: getAgentDisplayName(meetingConfig.bossAgentId),
        role: "boss",
        content: summary.text,
        durationMs: summary.durationMs,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      const errorMessage = `[总结失败] ${error?.message || String(error)}`;
      errors.push(errorMessage);
      bossSummary = "会议总结生成失败，请查看错误信息并手动补充总结。";
      await meetingStore.appendSpeakerNote(meetingRecord.id, {
        agentId: meetingConfig.bossAgentId,
        agentName: getAgentDisplayName(meetingConfig.bossAgentId),
        role: "boss",
        content: "",
        timestamp: Date.now(),
        error: errorMessage,
      });
    }

    const actionItems = buildActionItems(bossSummary, taskSnapshot);

    await meetingStore.completeMeeting(meetingRecord.id, {
      bossSummary,
      actionItems,
      errors,
    });

    meetingCount++;
    lastMeetingTime = Date.now();
    if (errors.length > 0) {
      meetingErrorCount += errors.length;
      lastMeetingError = errors[errors.length - 1];
    }

    return {
      success: true,
      meetingId: meetingRecord.id,
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    meetingErrorCount++;
    lastMeetingError = errorMessage;

    if (meetingRecord) {
      await meetingStore.failMeeting(meetingRecord.id, errorMessage);
    }

    return {
      success: false,
      meetingId: meetingRecord?.id,
      error: errorMessage,
    };
  } finally {
    isMeetingRunning = false;
  }
}

async function checkMeetingSchedule(): Promise<void> {
  if (isMeetingRunning) {
    return;
  }

  meetingConfig = buildMeetingConfig();
  if (!meetingConfig.enabled) {
    return;
  }

  const now = getNowPartsInTimezone(meetingConfig.timezone);
  if (now.hhmm < meetingConfig.dailyTime) {
    return;
  }

  if (lastScheduledDateKey === now.dateKey) {
    return;
  }

  lastScheduledDateKey = now.dateKey;
  const result = await runMeeting("scheduled");
  if (!result.success && result.error) {
    console.error(`[MeetingService] 定时会议执行失败: ${result.error}`);
  }
}

export function startMeetingService(): void {
  meetingConfig = buildMeetingConfig();

  if (meetingInterval) {
    console.log("[MeetingService] 会议服务已在运行");
    return;
  }

  if (!meetingConfig.enabled) {
    console.log("[MeetingService] 会议服务已禁用（meetingEnabled=false）");
    return;
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("🗓️  [会议服务] 启动自动会议服务");
  console.log("=".repeat(60));
  console.log(`   每日会议时间: ${meetingConfig.dailyTime} (${meetingConfig.timezone})`);
  console.log(`   参会员工: ${meetingConfig.participants.join(", ") || "无"}`);
  console.log("=".repeat(60));
  console.log("");

  void checkMeetingSchedule();

  meetingInterval = setInterval(() => {
    void checkMeetingSchedule();
  }, 30 * 1000);
}

export function stopMeetingService(): void {
  if (meetingInterval) {
    clearInterval(meetingInterval);
    meetingInterval = null;
    console.log("");
    console.log("🛑 [会议服务] 自动会议服务已停止");
    console.log(`   总计会议: ${meetingCount}`);
    console.log(`   错误次数: ${meetingErrorCount}`);
    console.log("");
  }
}

export function getMeetingServiceStatus(): {
  enabled: boolean;
  running: boolean;
  isMeetingRunning: boolean;
  meetingCount: number;
  lastMeetingTime: number;
  errorCount: number;
  lastError: string;
} {
  return {
    enabled: meetingConfig.enabled,
    running: meetingInterval !== null,
    isMeetingRunning,
    meetingCount,
    lastMeetingTime,
    errorCount: meetingErrorCount,
    lastError: lastMeetingError,
  };
}

export async function triggerMeetingNow(): Promise<{
  success: boolean;
  meetingId?: string;
  error?: string;
}> {
  console.log("");
  console.log("🔄 [手动触发] 执行团队会议");
  console.log("");

  return runMeeting("manual");
}

export function reloadMeetingService(): void {
  stopMeetingService();
  startMeetingService();
}
