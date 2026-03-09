import fs from "fs";
import path from "path";
import type { EpicPromptFiles } from "./epic-types";

export const PROMPT_DIR = path.join(process.cwd(), "prompt");

export const DEFAULT_EPIC_PROMPT_FILES: EpicPromptFiles = {
  planner: "epic-planner.md",
  reviewer: "epic-reviewer.md",
  report: "epic-report.md",
};

type EpicPromptTextMap = {
  planner: string;
  reviewer: string;
  report: string;
};

const DEFAULT_PROMPT_TEXT: EpicPromptTextMap = {
  planner: `你是 Boss Agent（{{ownerAgentId}}），正在管理一个长期迭代的大项任务。

【大项信息】
- 标题：{{epicTitle}}
- 目标：{{objective}}
- 成功标准：{{successCriteria}}
- 大框架任务：
{{frameworkPrompt}}

【当前轮次】
- 轮次编号：{{iterationNo}}
- 当前时间：{{now}}
- 剩余时长(毫秒，null=无限)：{{remainingDurationMs}}
- 剩余调用次数(null=无限)：{{remainingCallBudget}}

【任务绑定摘要（externalKey -> taskId）】
{{taskBindingsSummary}}

【上轮总结文档】
- 文档路径：{{lastIterationSummaryDocumentPath}}
- 总体进展：{{lastIterationOverview}}
- 下一步建议：
{{lastIterationNextRoundFocus}}

【上轮总结正文】
{{lastIterationSummary}}

请你输出“下一轮执行计划”，并严格输出 JSON（禁止 Markdown 包裹）：
{
  "iterationGoal": "本轮目标",
  "taskOperations": [
    {
      "externalKey": "唯一键，例如 core-architecture",
      "title": "任务标题",
      "description": "任务描述，必须可执行",
      "acceptanceCriteria": "验收标准，必须可验证",
      "priority": "low|medium|high|urgent",
      "assignedTo": "agentId，可为空",
      "dependsOnExternalKeys": ["其他 externalKey"],
      "tags": ["epic", "xxx"],
      "estimatedHours": 4,
      "autoDispatch": true
    }
  ],
  "testPlan": [
    {
      "agentId": "可为 boss 或员工",
      "objective": "测试目标",
      "prompt": "测试调用提示词",
      "maxCalls": 1
    }
  ],
  "optimizationHypotheses": ["本轮优化假设1", "本轮优化假设2"],
  "exitSignals": ["什么时候可以停止迭代"]
}

硬性要求：
1. taskOperations 只能给出可执行动作，不能空泛。
2. 每个任务必须包含 acceptanceCriteria。
3. 优先复用已有 externalKey，减少重复任务。
4. testPlan 必须覆盖 boss + 至少一名员工（若无员工则只保留 boss）。`,
  reviewer: `你是 Boss Agent（{{ownerAgentId}}），需要对本轮执行结果做复盘并给出下一轮优化方向。

【大项信息】
- 标题：{{epicTitle}}
- 目标：{{objective}}
- 成功标准：{{successCriteria}}

【本轮执行结果摘要】
{{iterationExecutionSummary}}

【预算信息】
- 本轮消耗调用次数：{{iterationCallsUsed}}
- 累计调用次数：{{totalCallsUsed}}
- 调用上限(null=无限)：{{callLimitTotal}}

请严格输出 JSON（禁止 Markdown 包裹）：
{
  "goNoGo": "go 或 stop",
  "overallProgress": "当前进展判断",
  "issues": [
    {
      "problem": "问题点（具体）",
      "evidence": "证据（具体结果、缺失项或冲突）",
      "suggestion": "修改建议（可执行动作）",
      "acceptance": "下一轮验收标准"
    }
  ],
  "nextRoundFocus": ["下一轮聚焦点1", "下一轮聚焦点2"],
  "reportMarkdown": "给管理层阅读的进度简报 markdown"
}

硬性要求：
1. 禁止泛化意见，问题必须能落到具体证据。
2. 建议必须是动作句，且可直接转任务。
3. reportMarkdown 必须明确包含“本轮做了什么”和“下一步建议”。
4. 如果满足成功标准，可将 goNoGo 设为 stop。`,
  report: `你是 Boss Agent（{{ownerAgentId}}），请将当前大项迭代状态整理成“汇报当前进度”报告。

【大项信息】
- 标题：{{epicTitle}}
- 目标：{{objective}}
- 成功标准：{{successCriteria}}
- 当前状态：{{epicStatus}}

【运行统计】
- 已完成轮次：{{iterationsCompleted}}
- 累计调用次数：{{totalCallsUsed}}
- 调用上限(null=无限)：{{callLimitTotal}}
- 已运行时长毫秒：{{elapsedDurationMs}}
- 时长上限毫秒(null=无限)：{{durationLimitMs}}

【最近迭代摘要】
{{recentIterationSummary}}

请输出 markdown，结构必须包含：
1. 总体进度
2. 本轮做了什么
3. 风险与阻塞
4. 下一步建议
5. 预算剩余（时长/调用次数）
`,
};

function isPromptFileNameSafe(fileName: string): boolean {
  return /^[A-Za-z0-9._-]+\.md$/.test(fileName);
}

export function normalizeEpicPromptFiles(value?: Partial<EpicPromptFiles> | null): EpicPromptFiles {
  const merged: EpicPromptFiles = {
    ...DEFAULT_EPIC_PROMPT_FILES,
    ...(value || {}),
  };

  return {
    planner: isPromptFileNameSafe(merged.planner) ? merged.planner : DEFAULT_EPIC_PROMPT_FILES.planner,
    reviewer: isPromptFileNameSafe(merged.reviewer) ? merged.reviewer : DEFAULT_EPIC_PROMPT_FILES.reviewer,
    report: isPromptFileNameSafe(merged.report) ? merged.report : DEFAULT_EPIC_PROMPT_FILES.report,
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

export function ensureEpicPromptFiles(files?: Partial<EpicPromptFiles> | null): EpicPromptFiles {
  const normalized = normalizeEpicPromptFiles(files);

  ensurePromptFile(normalized.planner, DEFAULT_PROMPT_TEXT.planner);
  ensurePromptFile(normalized.reviewer, DEFAULT_PROMPT_TEXT.reviewer);
  ensurePromptFile(normalized.report, DEFAULT_PROMPT_TEXT.report);

  return normalized;
}

export function readEpicPrompts(files?: Partial<EpicPromptFiles> | null): {
  files: EpicPromptFiles;
  prompts: EpicPromptTextMap;
} {
  const normalized = ensureEpicPromptFiles(files);

  const planner = fs.readFileSync(resolvePromptPath(normalized.planner), "utf-8");
  const reviewer = fs.readFileSync(resolvePromptPath(normalized.reviewer), "utf-8");
  const report = fs.readFileSync(resolvePromptPath(normalized.report), "utf-8");

  return {
    files: normalized,
    prompts: {
      planner,
      reviewer,
      report,
    },
  };
}

export function renderPromptTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>
): string {
  return template.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
