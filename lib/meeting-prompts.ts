import fs from "fs";
import path from "path";
import type { MeetingPromptFiles, MeetingPromptTextMap } from "./meeting-types";

export const PROMPT_DIR = path.join(process.cwd(), "prompt");

export const DEFAULT_MEETING_PROMPT_FILES: MeetingPromptFiles = {
  kickoff: "meeting-kickoff.md",
  employee: "meeting-employee.md",
  summary: "meeting-summary.md",
};

const DEFAULT_PROMPT_TEXT: MeetingPromptTextMap = {
  kickoff: `你是{{bossAgentId}}，现在需要主持今天的团队会议。\n\n会议目标：\n1. 对齐今天工作安排\n2. 对齐后续计划\n3. 讨论每位员工的自我进化方向\n4. 复盘未完成工作风险\n\n参会员工：{{participants}}\n当前未完成任务数：{{incompleteTaskCount}}\n当前日期：{{today}}\n\n请输出：\n- 开场说明\n- 本次会议重点议题\n- 对员工发言要求\n`,
  employee: `你是员工 {{agentId}}，正在参加 Boss 组织的会议。\n\n会议日期：{{today}}\nBoss：{{bossAgentId}}\n\n你的发言必须包含以下四个部分：\n1. 今天工作安排\n2. 后续安排\n3. 自我进化计划（技能、方法、协作改进）\n4. 对未完成工作的讨论与建议\n\n未完成任务摘要：\n{{incompleteTasks}}\n\n请输出结构化内容，尽量给出可执行条目。\n`,
  summary: `你是{{bossAgentId}}，请基于员工发言生成会议总结。\n\n会议日期：{{today}}\n参会员工：{{participants}}\n\n员工发言汇总：\n{{employeeNotes}}\n\n请输出：\n1. 会议结论\n2. 每位员工的行动项\n3. 未完成工作的处理策略\n4. 后续跟踪计划\n`,
};

function isPromptFileNameSafe(fileName: string): boolean {
  return /^[A-Za-z0-9._-]+\.md$/.test(fileName);
}

export function normalizeMeetingPromptFiles(value?: Partial<MeetingPromptFiles> | null): MeetingPromptFiles {
  const merged: MeetingPromptFiles = {
    ...DEFAULT_MEETING_PROMPT_FILES,
    ...(value || {}),
  };

  return {
    kickoff: isPromptFileNameSafe(merged.kickoff) ? merged.kickoff : DEFAULT_MEETING_PROMPT_FILES.kickoff,
    employee: isPromptFileNameSafe(merged.employee) ? merged.employee : DEFAULT_MEETING_PROMPT_FILES.employee,
    summary: isPromptFileNameSafe(merged.summary) ? merged.summary : DEFAULT_MEETING_PROMPT_FILES.summary,
  };
}

function resolvePromptPath(fileName: string): string {
  if (!isPromptFileNameSafe(fileName)) {
    throw new Error(`非法 prompt 文件名: ${fileName}`);
  }

  const resolved = path.resolve(PROMPT_DIR, fileName);
  const promptRoot = path.resolve(PROMPT_DIR);
  if (!resolved.startsWith(`${promptRoot}${path.sep}`)) {
    throw new Error(`非法 prompt 文件路径: ${fileName}`);
  }
  return resolved;
}

function ensurePromptDir(): void {
  if (!fs.existsSync(PROMPT_DIR)) {
    fs.mkdirSync(PROMPT_DIR, { recursive: true });
  }
}

function ensurePromptFile(fileName: string, fallbackText: string): void {
  ensurePromptDir();
  const filePath = resolvePromptPath(fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${fallbackText}\n`, "utf-8");
  }
}

export function ensureMeetingPromptFiles(files?: Partial<MeetingPromptFiles> | null): MeetingPromptFiles {
  const normalized = normalizeMeetingPromptFiles(files);

  ensurePromptFile(normalized.kickoff, DEFAULT_PROMPT_TEXT.kickoff);
  ensurePromptFile(normalized.employee, DEFAULT_PROMPT_TEXT.employee);
  ensurePromptFile(normalized.summary, DEFAULT_PROMPT_TEXT.summary);

  return normalized;
}

export function readMeetingPrompts(files?: Partial<MeetingPromptFiles> | null): {
  files: MeetingPromptFiles;
  prompts: MeetingPromptTextMap;
} {
  const normalized = ensureMeetingPromptFiles(files);

  const kickoff = fs.readFileSync(resolvePromptPath(normalized.kickoff), "utf-8");
  const employee = fs.readFileSync(resolvePromptPath(normalized.employee), "utf-8");
  const summary = fs.readFileSync(resolvePromptPath(normalized.summary), "utf-8");

  return {
    files: normalized,
    prompts: {
      kickoff,
      employee,
      summary,
    },
  };
}

export function writeMeetingPrompts(
  content: Partial<MeetingPromptTextMap>,
  files?: Partial<MeetingPromptFiles> | null
): {
  files: MeetingPromptFiles;
  prompts: MeetingPromptTextMap;
} {
  const normalized = ensureMeetingPromptFiles(files);

  if (typeof content.kickoff === "string") {
    fs.writeFileSync(resolvePromptPath(normalized.kickoff), `${content.kickoff.trim()}\n`, "utf-8");
  }
  if (typeof content.employee === "string") {
    fs.writeFileSync(resolvePromptPath(normalized.employee), `${content.employee.trim()}\n`, "utf-8");
  }
  if (typeof content.summary === "string") {
    fs.writeFileSync(resolvePromptPath(normalized.summary), `${content.summary.trim()}\n`, "utf-8");
  }

  return readMeetingPrompts(normalized);
}

export function renderPromptTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
