import { NextResponse } from "next/server";
import type { SystemConfig } from "@/lib/system-config";
import { getSystemConfig, updateSystemConfig } from "@/lib/system-config";
import {
  getSchedulerStatus,
  startTaskScheduler,
  stopTaskScheduler,
} from "@/lib/task-scheduler-service";
import {
  getBossReviewerStatus,
  startBossReviewer,
  stopBossReviewer,
} from "@/lib/task-scheduler-extended";
import {
  getMeetingServiceStatus,
  startMeetingService,
  stopMeetingService,
} from "@/lib/meeting-service";
import { VALID_MEETING_DISCUSSION_STATUSES } from "@/lib/meeting-types";
import type { TaskStatus } from "@/lib/task-types";

type RuntimeService = "scheduler" | "reviewer" | "meeting";

const SYSTEM_CONFIG_KEYS = [
  "notificationEnabled",
  "feishuNotificationEnabled",
  "logLevel",
  "defaultAgent",
  "availableAgents",
  "agentDisplayNameMap",
  "accounts",
  "gatewayDefaultPort",
  "taskDispatchEnabled",
  "taskDispatchMaxConcurrent",
  "taskDispatchIntervalSeconds",
  "taskDispatchMaxRetries",
  "taskDispatchRetryDelaySeconds",
  "taskDispatchWaitForIdleMaxSeconds",
  "taskDispatchWaitCheckIntervalSeconds",
  "bossReviewEnabled",
  "bossReviewIntervalSeconds",
  "bossReviewMaxConcurrent",
  "alertsDefaultCheckIntervalMinutes",
  "agentActivitySessionLookbackDays",
  "agentActivityMaxParentSessionsToParse",
  "agentActivityOrphanFallbackWindowMinutes",
  "agentActivitySubagentMaxActiveMinutes",
  "feishuDefaultChatId",
  "feishuBotScriptPath",
  "feishuBotMap",
  "feishuBots",
  "meetingEnabled",
  "meetingDailyTime",
  "meetingTimezone",
  "meetingParticipants",
  "meetingDiscussionStatuses",
  "meetingPromptFiles",
  "alertsDefaultRules",
] as const satisfies ReadonlyArray<keyof SystemConfig>;

const SCHEDULER_RUNTIME_FIELDS: Array<keyof SystemConfig> = [
  "taskDispatchEnabled",
  "taskDispatchMaxConcurrent",
  "taskDispatchIntervalSeconds",
  "taskDispatchMaxRetries",
  "taskDispatchRetryDelaySeconds",
  "taskDispatchWaitForIdleMaxSeconds",
  "taskDispatchWaitCheckIntervalSeconds",
];

const REVIEWER_RUNTIME_FIELDS: Array<keyof SystemConfig> = [
  "bossReviewEnabled",
  "bossReviewIntervalSeconds",
  "bossReviewMaxConcurrent",
];

const MEETING_RUNTIME_FIELDS: Array<keyof SystemConfig> = [
  "meetingEnabled",
  "meetingDailyTime",
  "meetingTimezone",
  "meetingParticipants",
  "meetingDiscussionStatuses",
  "meetingPromptFiles",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureKnownTopLevelKeys(
  value: Record<string, unknown>,
  validKeys: readonly string[]
): void {
  for (const key of Object.keys(value)) {
    if (!validKeys.includes(key)) {
      throw new Error(`未知配置字段: ${key}`);
    }
  }
}

function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} 必须是布尔值`);
  }
  return value;
}

function parseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} 必须是字符串`);
  }
  return value;
}

function parseInteger(
  value: unknown,
  fieldName: string,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${fieldName} 必须是整数`);
  }
  if (value < min) {
    throw new Error(`${fieldName} 不能小于 ${min}`);
  }
  if (value > max) {
    throw new Error(`${fieldName} 不能大于 ${max}`);
  }
  return value;
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是字符串数组`);
  }
  if (value.some((item) => typeof item !== "string")) {
    throw new Error(`${fieldName} 的数组项必须是字符串`);
  }
  return value;
}

function parseStringRecord(value: unknown, fieldName: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} 必须是对象`);
  }
  const output: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val !== "string") {
      throw new Error(`${fieldName}.${key} 必须是字符串`);
    }
    output[key] = val;
  }
  return output;
}

function parseAccounts(
  value: unknown,
  fieldName: string
): Record<string, { description?: string }> {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} 必须是对象`);
  }
  const output: Record<string, { description?: string }> = {};
  for (const [accountId, rawAccount] of Object.entries(value)) {
    if (!isRecord(rawAccount)) {
      throw new Error(`${fieldName}.${accountId} 必须是对象`);
    }
    const description = rawAccount.description;
    if (description !== undefined && typeof description !== "string") {
      throw new Error(`${fieldName}.${accountId}.description 必须是字符串`);
    }
    output[accountId] = description !== undefined ? { description } : {};
  }
  return output;
}

function parseFeishuBots(
  value: unknown,
  fieldName: string
): SystemConfig["feishuBots"] {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} 必须是对象`);
  }

  const output: SystemConfig["feishuBots"] = {};
  for (const [botKey, rawBot] of Object.entries(value)) {
    if (!isRecord(rawBot)) {
      throw new Error(`${fieldName}.${botKey} 必须是对象`);
    }

    output[botKey] = {
      name: parseString(rawBot.name, `${fieldName}.${botKey}.name`),
      appId: parseString(rawBot.appId, `${fieldName}.${botKey}.appId`),
      appSecret: parseString(rawBot.appSecret, `${fieldName}.${botKey}.appSecret`),
    };
  }

  return output;
}

function parseMeetingDailyTime(value: unknown, fieldName: string): string {
  const val = parseString(value, fieldName);
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(val)) {
    throw new Error(`${fieldName} 必须是 HH:MM 格式`);
  }
  return val;
}

function parseMeetingDiscussionStatuses(
  value: unknown,
  fieldName: string
): TaskStatus[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是数组`);
  }

  const output: TaskStatus[] = [];
  for (const [idx, item] of value.entries()) {
    if (typeof item !== "string") {
      throw new Error(`${fieldName}[${idx}] 必须是字符串`);
    }
    if (!VALID_MEETING_DISCUSSION_STATUSES.includes(item as TaskStatus)) {
      throw new Error(`${fieldName}[${idx}] 不是支持的任务状态`);
    }
    output.push(item as TaskStatus);
  }

  if (output.length === 0) {
    throw new Error(`${fieldName} 至少需要一个任务状态`);
  }

  return output;
}

function parseMeetingPromptFiles(
  value: unknown,
  fieldName: string
): SystemConfig["meetingPromptFiles"] {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} 必须是对象`);
  }

  const kickoff = parseString(value.kickoff, `${fieldName}.kickoff`);
  const employee = parseString(value.employee, `${fieldName}.employee`);
  const summary = parseString(value.summary, `${fieldName}.summary`);
  const fileNamePattern = /^[A-Za-z0-9._-]+\.md$/;

  for (const [key, fileName] of Object.entries({ kickoff, employee, summary })) {
    if (!fileNamePattern.test(fileName)) {
      throw new Error(`${fieldName}.${key} 必须是 .md 文件名（禁止路径）`);
    }
  }

  return { kickoff, employee, summary };
}

function parseAlertRules(value: unknown): SystemConfig["alertsDefaultRules"] {
  if (!Array.isArray(value)) {
    throw new Error("alertsDefaultRules 必须是数组");
  }

  return value.map((rule, idx) => {
    if (!isRecord(rule)) {
      throw new Error(`alertsDefaultRules[${idx}] 必须是对象`);
    }

    const id = parseString(rule.id, `alertsDefaultRules[${idx}].id`);
    const name = parseString(rule.name, `alertsDefaultRules[${idx}].name`);
    const enabled = parseBoolean(rule.enabled, `alertsDefaultRules[${idx}].enabled`);
    const threshold = rule.threshold;

    if (threshold !== undefined && (typeof threshold !== "number" || !Number.isFinite(threshold))) {
      throw new Error(`alertsDefaultRules[${idx}].threshold 必须是数字`);
    }

    return {
      id,
      name,
      enabled,
      ...(threshold !== undefined ? { threshold } : {}),
    };
  });
}

function validateSystemConfigInput(input: unknown): SystemConfig {
  if (!isRecord(input)) {
    throw new Error("config 必须是对象");
  }

  ensureKnownTopLevelKeys(input, SYSTEM_CONFIG_KEYS);
  const current = getSystemConfig({ forceRefresh: true });
  const merged: SystemConfig = {
    ...current,
    ...(input as Partial<SystemConfig>),
  };

  return {
    notificationEnabled: parseBoolean(merged.notificationEnabled, "notificationEnabled"),
    feishuNotificationEnabled: parseBoolean(merged.feishuNotificationEnabled, "feishuNotificationEnabled"),
    logLevel: parseString(merged.logLevel, "logLevel"),
    defaultAgent: parseString(merged.defaultAgent, "defaultAgent"),
    availableAgents: parseStringArray(merged.availableAgents, "availableAgents"),
    agentDisplayNameMap: parseStringRecord(merged.agentDisplayNameMap, "agentDisplayNameMap"),
    accounts: parseAccounts(merged.accounts, "accounts"),
    gatewayDefaultPort: parseInteger(merged.gatewayDefaultPort, "gatewayDefaultPort", 1, 65535),
    taskDispatchEnabled: parseBoolean(merged.taskDispatchEnabled, "taskDispatchEnabled"),
    taskDispatchMaxConcurrent: parseInteger(merged.taskDispatchMaxConcurrent, "taskDispatchMaxConcurrent", 1, 100),
    taskDispatchIntervalSeconds: parseInteger(merged.taskDispatchIntervalSeconds, "taskDispatchIntervalSeconds", 5, 86_400),
    taskDispatchMaxRetries: parseInteger(merged.taskDispatchMaxRetries, "taskDispatchMaxRetries", 0, 100),
    taskDispatchRetryDelaySeconds: parseInteger(merged.taskDispatchRetryDelaySeconds, "taskDispatchRetryDelaySeconds", 1, 86_400),
    taskDispatchWaitForIdleMaxSeconds: parseInteger(merged.taskDispatchWaitForIdleMaxSeconds, "taskDispatchWaitForIdleMaxSeconds", 0, 86_400),
    taskDispatchWaitCheckIntervalSeconds: parseInteger(merged.taskDispatchWaitCheckIntervalSeconds, "taskDispatchWaitCheckIntervalSeconds", 1, 3600),
    bossReviewEnabled: parseBoolean(merged.bossReviewEnabled, "bossReviewEnabled"),
    bossReviewIntervalSeconds: parseInteger(merged.bossReviewIntervalSeconds, "bossReviewIntervalSeconds", 5, 86_400),
    bossReviewMaxConcurrent: parseInteger(merged.bossReviewMaxConcurrent, "bossReviewMaxConcurrent", 1, 100),
    alertsDefaultCheckIntervalMinutes: parseInteger(merged.alertsDefaultCheckIntervalMinutes, "alertsDefaultCheckIntervalMinutes", 1, 1440),
    agentActivitySessionLookbackDays: parseInteger(merged.agentActivitySessionLookbackDays, "agentActivitySessionLookbackDays", 1, 365),
    agentActivityMaxParentSessionsToParse: parseInteger(merged.agentActivityMaxParentSessionsToParse, "agentActivityMaxParentSessionsToParse", 1, 1000),
    agentActivityOrphanFallbackWindowMinutes: parseInteger(merged.agentActivityOrphanFallbackWindowMinutes, "agentActivityOrphanFallbackWindowMinutes", 1, 1440),
    agentActivitySubagentMaxActiveMinutes: parseInteger(merged.agentActivitySubagentMaxActiveMinutes, "agentActivitySubagentMaxActiveMinutes", 1, 1440),
    feishuDefaultChatId: parseString(merged.feishuDefaultChatId, "feishuDefaultChatId"),
    feishuBotScriptPath: parseString(merged.feishuBotScriptPath, "feishuBotScriptPath"),
    feishuBotMap: parseStringRecord(merged.feishuBotMap, "feishuBotMap"),
    feishuBots: parseFeishuBots(merged.feishuBots, "feishuBots"),
    meetingEnabled: parseBoolean(merged.meetingEnabled, "meetingEnabled"),
    meetingDailyTime: parseMeetingDailyTime(merged.meetingDailyTime, "meetingDailyTime"),
    meetingTimezone: parseString(merged.meetingTimezone, "meetingTimezone"),
    meetingParticipants: parseStringArray(merged.meetingParticipants, "meetingParticipants"),
    meetingDiscussionStatuses: parseMeetingDiscussionStatuses(
      merged.meetingDiscussionStatuses,
      "meetingDiscussionStatuses"
    ),
    meetingPromptFiles: parseMeetingPromptFiles(merged.meetingPromptFiles, "meetingPromptFiles"),
    alertsDefaultRules: parseAlertRules(merged.alertsDefaultRules),
  };
}

function getReloadCandidates(
  previous: SystemConfig,
  next: SystemConfig,
  schedulerRunning: boolean,
  reviewerRunning: boolean,
  meetingRunning: boolean
): RuntimeService[] {
  const candidates: RuntimeService[] = [];

  const schedulerChanged = SCHEDULER_RUNTIME_FIELDS.some(
    (field) => previous[field] !== next[field]
  );
  if (schedulerRunning && schedulerChanged) {
    candidates.push("scheduler");
  }

  const reviewerChanged = REVIEWER_RUNTIME_FIELDS.some(
    (field) => previous[field] !== next[field]
  );
  if (reviewerRunning && reviewerChanged) {
    candidates.push("reviewer");
  }

  const meetingChanged = MEETING_RUNTIME_FIELDS.some(
    (field) => previous[field] !== next[field]
  );
  if (meetingRunning && meetingChanged) {
    candidates.push("meeting");
  }

  return candidates;
}

function parseServices(raw: unknown): RuntimeService[] {
  if (raw === undefined) {
    return ["scheduler", "reviewer", "meeting"];
  }
  if (!Array.isArray(raw)) {
    throw new Error("services 必须是数组");
  }

  const deduped = Array.from(new Set(raw));
  if (deduped.some((svc) => svc !== "scheduler" && svc !== "reviewer" && svc !== "meeting")) {
    throw new Error("services 仅支持 scheduler / reviewer / meeting");
  }

  return deduped as RuntimeService[];
}

function reloadRuntimeServices(services: RuntimeService[]): RuntimeService[] {
  const reloaded: RuntimeService[] = [];

  for (const service of services) {
    if (service === "scheduler") {
      stopTaskScheduler();
      startTaskScheduler();
      reloaded.push("scheduler");
      continue;
    }

    if (service === "reviewer") {
      stopBossReviewer();
      startBossReviewer();
      reloaded.push("reviewer");
      continue;
    }

    stopMeetingService();
    startMeetingService();
    reloaded.push("meeting");
  }

  return reloaded;
}

export async function GET() {
  const config = getSystemConfig();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : "save";

    if (action === "reload") {
      const services = parseServices(body?.services);
      const reloaded = reloadRuntimeServices(services);

      return NextResponse.json({
        success: true,
        action: "reload",
        reloaded,
        runtime: {
          scheduler: getSchedulerStatus(),
          reviewer: getBossReviewerStatus(),
          meeting: getMeetingServiceStatus(),
        },
      });
    }

    if (action !== "save") {
      return NextResponse.json(
        { success: false, error: `未知 action: ${action}` },
        { status: 400 }
      );
    }

    const previous = getSystemConfig({ forceRefresh: true });
    const schedulerRunning = getSchedulerStatus().running;
    const reviewerRunning = getBossReviewerStatus().running;
    const meetingRunning = getMeetingServiceStatus().running;

    const rawConfig = body?.config ?? body;
    const nextConfig = validateSystemConfigInput(rawConfig);
    const saved = updateSystemConfig(nextConfig);

    const reloadCandidates = getReloadCandidates(
      previous,
      saved,
      schedulerRunning,
      reviewerRunning,
      meetingRunning
    );

    return NextResponse.json({
      success: true,
      action: "save",
      config: saved,
      needsRuntimeReload: reloadCandidates.length > 0,
      reloadCandidates,
      runtime: {
        scheduler: getSchedulerStatus(),
        reviewer: getBossReviewerStatus(),
        meeting: getMeetingServiceStatus(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "更新 system config 失败",
      },
      { status: 400 }
    );
  }
}
