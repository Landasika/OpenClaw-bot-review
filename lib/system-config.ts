import fs from "fs";
import path from "path";
import type { TaskStatus } from "./task-types";
import {
  DEFAULT_MEETING_DISCUSSION_STATUSES,
  VALID_MEETING_DISCUSSION_STATUSES,
} from "./meeting-types";
import type { MeetingPromptFiles } from "./meeting-types";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface AlertRuleConfig {
  id: string;
  name: string;
  enabled: boolean;
  threshold?: number;
}

export interface FeishuBotConfig {
  name: string;
  appId: string;
  appSecret: string;
}

export interface SystemConfig {
  notificationEnabled: boolean;
  feishuNotificationEnabled: boolean;
  logLevel: LogLevel | string;
  defaultAgent: string;
  availableAgents: string[];
  agentDisplayNameMap: Record<string, string>;
  accounts: Record<string, { description?: string }>;
  gatewayDefaultPort: number;
  taskDispatchEnabled: boolean;
  taskDispatchMaxConcurrent: number;
  taskDispatchIntervalSeconds: number;
  taskDispatchMaxRetries: number;
  taskDispatchRetryDelaySeconds: number;
  taskDispatchWaitForIdleMaxSeconds: number;
  taskDispatchWaitCheckIntervalSeconds: number;
  bossReviewEnabled: boolean;
  bossReviewIntervalSeconds: number;
  bossReviewMaxConcurrent: number;
  alertsDefaultCheckIntervalMinutes: number;
  agentActivitySessionLookbackDays: number;
  agentActivityMaxParentSessionsToParse: number;
  agentActivityOrphanFallbackWindowMinutes: number;
  agentActivitySubagentMaxActiveMinutes: number;
  feishuDefaultChatId: string;
  feishuBotScriptPath: string;
  feishuBotMap: Record<string, string>;
  feishuBots: Record<string, FeishuBotConfig>;
  meetingEnabled: boolean;
  meetingDailyTime: string;
  meetingTimezone: string;
  meetingParticipants: string[];
  meetingDiscussionStatuses: TaskStatus[];
  meetingPromptFiles: MeetingPromptFiles;
  alertsDefaultRules: AlertRuleConfig[];
}

const SYSTEM_CONFIG_PATH = path.join(process.cwd(), "data", "system-config.json");
const CACHE_TTL_MS = 5_000;

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  notificationEnabled: true,
  feishuNotificationEnabled: true,
  logLevel: "info",
  defaultAgent: "main",
  availableAgents: ["main"],
  agentDisplayNameMap: {
    main: "Main Agent",
  },
  accounts: {
    main: {
      description: "Default main agent account",
    },
  },
  gatewayDefaultPort: 18_789,
  taskDispatchEnabled: true,
  taskDispatchMaxConcurrent: 3,
  taskDispatchIntervalSeconds: 60,
  taskDispatchMaxRetries: 3,
  taskDispatchRetryDelaySeconds: 300,
  taskDispatchWaitForIdleMaxSeconds: 600,
  taskDispatchWaitCheckIntervalSeconds: 30,
  bossReviewEnabled: true,
  bossReviewIntervalSeconds: 30,
  bossReviewMaxConcurrent: 2,
  alertsDefaultCheckIntervalMinutes: 10,
  agentActivitySessionLookbackDays: 7,
  agentActivityMaxParentSessionsToParse: 40,
  agentActivityOrphanFallbackWindowMinutes: 15,
  agentActivitySubagentMaxActiveMinutes: 30,
  feishuDefaultChatId: "",
  feishuBotScriptPath: "scripts/feishu_bot_send.py",
  feishuBotMap: {
    main: "boss",
  },
  feishuBots: {
    boss: { name: "Boss", appId: "", appSecret: "" },
    searcher: { name: "Searcher", appId: "", appSecret: "" },
    osadmin: { name: "OSAdmin", appId: "", appSecret: "" },
    coder: { name: "Coder", appId: "", appSecret: "" },
    docmanager: { name: "DocManager", appId: "", appSecret: "" },
  },
  meetingEnabled: false,
  meetingDailyTime: "09:30",
  meetingTimezone: "Asia/Shanghai",
  meetingParticipants: [],
  meetingDiscussionStatuses: DEFAULT_MEETING_DISCUSSION_STATUSES,
  meetingPromptFiles: {
    kickoff: "meeting-kickoff.md",
    employee: "meeting-employee.md",
    summary: "meeting-summary.md",
  },
  alertsDefaultRules: [
    { id: "model_unavailable", name: "Model Unavailable", enabled: false },
    { id: "bot_no_response", name: "Bot Long Time No Response", enabled: false, threshold: 300 },
    { id: "message_failure_rate", name: "Message Failure Rate High", enabled: false, threshold: 50 },
    { id: "cron连续_failure", name: "Cron Continuous Failure", enabled: false, threshold: 3 },
  ],
};

let cache: { ts: number; data: SystemConfig } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isRecord(base) || !isRecord(patch)) {
    return (patch as T) ?? base;
  }

  const output: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = output[key];

    if (Array.isArray(patchValue)) {
      output[key] = patchValue;
      continue;
    }

    if (isRecord(baseValue) && isRecord(patchValue)) {
      output[key] = deepMerge(baseValue, patchValue);
      continue;
    }

    if (patchValue !== undefined) {
      output[key] = patchValue;
    }
  }

  return output as T;
}

function normalizeConfig(config: SystemConfig): SystemConfig {
  const availableAgents = config.availableAgents.length > 0
    ? config.availableAgents
    : [config.defaultAgent];

  const defaultAgent = config.defaultAgent || availableAgents[0] || "main";
  const feishuBotMap = Object.keys(config.feishuBotMap).length > 0
    ? config.feishuBotMap
    : { [defaultAgent]: "boss" };
  const feishuBots = Object.keys(config.feishuBots || {}).length > 0
    ? config.feishuBots
    : DEFAULT_SYSTEM_CONFIG.feishuBots;
  const meetingParticipants = Array.isArray(config.meetingParticipants)
    ? config.meetingParticipants.filter((agentId) => typeof agentId === "string" && agentId.trim() !== "")
    : [];
  const meetingDiscussionStatuses = Array.isArray(config.meetingDiscussionStatuses)
    ? config.meetingDiscussionStatuses.filter((status): status is TaskStatus =>
      VALID_MEETING_DISCUSSION_STATUSES.includes(status)
    )
    : [];
  const meetingPromptFiles = {
    kickoff: typeof config.meetingPromptFiles?.kickoff === "string" && config.meetingPromptFiles.kickoff.trim() !== ""
      ? config.meetingPromptFiles.kickoff
      : DEFAULT_SYSTEM_CONFIG.meetingPromptFiles.kickoff,
    employee: typeof config.meetingPromptFiles?.employee === "string" && config.meetingPromptFiles.employee.trim() !== ""
      ? config.meetingPromptFiles.employee
      : DEFAULT_SYSTEM_CONFIG.meetingPromptFiles.employee,
    summary: typeof config.meetingPromptFiles?.summary === "string" && config.meetingPromptFiles.summary.trim() !== ""
      ? config.meetingPromptFiles.summary
      : DEFAULT_SYSTEM_CONFIG.meetingPromptFiles.summary,
  };
  const meetingDailyTime = typeof config.meetingDailyTime === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(config.meetingDailyTime)
    ? config.meetingDailyTime
    : DEFAULT_SYSTEM_CONFIG.meetingDailyTime;
  const meetingTimezone = typeof config.meetingTimezone === "string" && config.meetingTimezone.trim() !== ""
    ? config.meetingTimezone
    : DEFAULT_SYSTEM_CONFIG.meetingTimezone;

  return {
    ...config,
    defaultAgent,
    availableAgents,
    feishuBotMap,
    feishuBots,
    meetingDailyTime,
    meetingTimezone,
    meetingParticipants,
    meetingDiscussionStatuses: meetingDiscussionStatuses.length > 0
      ? meetingDiscussionStatuses
      : DEFAULT_MEETING_DISCUSSION_STATUSES,
    meetingPromptFiles,
  };
}

export function getSystemConfig(options?: { forceRefresh?: boolean }): SystemConfig {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  let merged = DEFAULT_SYSTEM_CONFIG;
  try {
    if (fs.existsSync(SYSTEM_CONFIG_PATH)) {
      const raw = fs.readFileSync(SYSTEM_CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      merged = deepMerge(DEFAULT_SYSTEM_CONFIG, parsed);
    }
  } catch {
    merged = DEFAULT_SYSTEM_CONFIG;
  }

  const normalized = normalizeConfig(merged);
  cache = { ts: Date.now(), data: normalized };
  return normalized;
}

export function getSystemConfigPath(): string {
  return SYSTEM_CONFIG_PATH;
}

export function getAvailableAgents(): string[] {
  return getSystemConfig().availableAgents;
}

export function getAgentDisplayName(agentId: string): string {
  const cfg = getSystemConfig();
  return cfg.agentDisplayNameMap[agentId] || agentId;
}

export function getDefaultAgentId(): string {
  return getSystemConfig().defaultAgent;
}

export function resolveFeishuBotScriptPath(): string {
  const scriptPath = getSystemConfig().feishuBotScriptPath || "scripts/feishu_bot_send.py";
  return path.isAbsolute(scriptPath) ? scriptPath : path.join(process.cwd(), scriptPath);
}

export function updateSystemConfig(patch: Partial<SystemConfig>): SystemConfig {
  const current = getSystemConfig({ forceRefresh: true });
  const merged = normalizeConfig(deepMerge<SystemConfig>(current, patch));

  const configDir = path.dirname(SYSTEM_CONFIG_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(SYSTEM_CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  cache = { ts: Date.now(), data: merged };
  return merged;
}
