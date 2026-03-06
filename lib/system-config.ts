import fs from "fs";
import path from "path";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface AlertRuleConfig {
  id: string;
  name: string;
  enabled: boolean;
  threshold?: number;
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

  return {
    ...config,
    defaultAgent,
    availableAgents,
    feishuBotMap,
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
