import type {
  Task,
  TaskAcceptanceChecklistItem,
  TaskAcceptanceChecklistStatus,
  TaskResultDetails,
} from "./task-types";
import { extractAcceptanceCriteria } from "./task-acceptance";

const CHECKLIST_STATUS_LABELS: Record<TaskAcceptanceChecklistStatus, string> = {
  done: "已完成",
  partial: "部分完成",
  not_done: "未完成",
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} 不能为空`);
  }
  return value.trim();
}

function normalizeCriterionKey(value: string): string {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function parseChecklistStatus(value: unknown): TaskAcceptanceChecklistStatus | null {
  if (value === "done" || value === "partial" || value === "not_done") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["done", "completed", "complete", "已完成", "完成", "pass", "passed"].includes(normalized)) {
    return "done";
  }
  if (["partial", "partially_done", "部分完成", "部分", "in_progress"].includes(normalized)) {
    return "partial";
  }
  if (["not_done", "todo", "未完成", "未做", "fail", "failed"].includes(normalized)) {
    return "not_done";
  }
  return null;
}

function isChecklistItemLike(item: unknown): item is Record<string, unknown> {
  return Boolean(item) && typeof item === "object";
}

function normalizeChecklist(raw: unknown): TaskAcceptanceChecklistItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("acceptanceChecklist 必须是非空数组");
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`acceptanceChecklist[${index}] 格式不正确`);
    }

    const criterion = requireNonEmptyString((item as { criterion?: unknown }).criterion, `acceptanceChecklist[${index}].criterion`);
    const status = parseChecklistStatus((item as { status?: unknown }).status);
    if (!status) {
      throw new Error(`acceptanceChecklist[${index}].status 必须是 done / partial / not_done`);
    }
    const evidence = requireNonEmptyString((item as { evidence?: unknown }).evidence, `acceptanceChecklist[${index}].evidence`);

    return {
      criterion,
      status,
      evidence,
    };
  });
}

function normalizeAttachments(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error("attachments 必须是字符串数组");
  }
  return raw
    .map((item, index) => {
      if (typeof item !== "string" || item.trim() === "") {
        throw new Error(`attachments[${index}] 必须是非空字符串`);
      }
      return item.trim();
    });
}

function normalizeActualHours(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("actualHours 必须是大于等于 0 的数字");
  }
  return value;
}

export function buildTaskResultMarkdown(resultDetails: TaskResultDetails): string {
  const checklistLines = resultDetails.acceptanceChecklist.map((item, index) => {
    const statusLabel = CHECKLIST_STATUS_LABELS[item.status];
    return `${index + 1}. [${statusLabel}] ${item.criterion}\n   证据: ${item.evidence}`;
  });

  return [
    "【结论摘要】",
    resultDetails.summary,
    "",
    "【实现过程】",
    resultDetails.implementation,
    "",
    "【验证结果】",
    resultDetails.verification,
    "",
    "【风险与限制】",
    resultDetails.risks,
    "",
    "【验收逐条回应】",
    checklistLines.join("\n"),
  ].join("\n");
}

function extractStructuredPayload(input: unknown, depth = 0): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || depth > 4) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const candidateStatus = Array.isArray(record.acceptanceChecklist)
    ? record.acceptanceChecklist.every((item) => isChecklistItemLike(item))
    : false;
  if (
    typeof record.summary === "string" &&
    typeof record.implementation === "string" &&
    typeof record.verification === "string" &&
    typeof record.risks === "string" &&
    candidateStatus
  ) {
    return record;
  }

  for (const value of Object.values(record)) {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        const nested = extractStructuredPayload(parsed, depth + 1);
        if (nested) {
          return nested;
        }
      } catch {}
      continue;
    }

    const nested = extractStructuredPayload(value, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function extractSection(text: string, heading: string, nextHeadings: string[]): string {
  const headingRegex = new RegExp(`(?:^|\\n)【?${heading}】?\\s*\\n?`, "i");
  const match = headingRegex.exec(text);
  if (!match || match.index === undefined) {
    return "";
  }
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  let end = rest.length;

  for (const nextHeading of nextHeadings) {
    const nextRegex = new RegExp(`(?:\\n)【?${nextHeading}】?\\s*\\n?`, "i");
    const nextMatch = nextRegex.exec(rest);
    if (nextMatch && nextMatch.index !== undefined) {
      end = Math.min(end, nextMatch.index);
    }
  }

  return rest.slice(0, end).trim();
}

function extractStructuredPayloadFromText(
  responseText: string,
  expectedCriteria: string[]
): TaskResultDetails {
  const normalized = responseText.trim();
  const summary = extractSection(normalized, "结论摘要|结论|总结|完成情况", [
    "实现过程|处理过程|执行过程|步骤",
    "验证结果|测试结果|验证|测试",
    "风险与限制|风险|限制",
    "验收逐条回应|验收回应|验收清单",
  ]);
  const implementation = extractSection(normalized, "实现过程|处理过程|执行过程|步骤", [
    "验证结果|测试结果|验证|测试",
    "风险与限制|风险|限制",
    "验收逐条回应|验收回应|验收清单",
  ]);
  const verification = extractSection(normalized, "验证结果|测试结果|验证|测试", [
    "风险与限制|风险|限制",
    "验收逐条回应|验收回应|验收清单",
  ]);
  const risks = extractSection(normalized, "风险与限制|风险|限制", [
    "验收逐条回应|验收回应|验收清单",
  ]);

  const acceptanceChecklist = expectedCriteria.map((criterion) => {
    const compactCriterion = normalizeCriterionKey(criterion);
    const matchedLine = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => normalizeCriterionKey(line).includes(compactCriterion));

    return {
      criterion,
      status: matchedLine ? "done" : "partial",
      evidence: matchedLine || "自动调度未显式给出该验收项证据，请人工复核",
    } satisfies TaskAcceptanceChecklistItem;
  });

  return {
    summary: summary || normalized.split(/\r?\n/).find(Boolean) || normalized,
    implementation: implementation || normalized,
    verification: verification || "自动调度响应未明确给出验证结果，请人工复核",
    risks: risks || "自动调度响应未明确给出风险与限制，请人工复核",
    acceptanceChecklist,
  };
}

export function normalizeTaskResultSubmission(
  rawBody: unknown,
  task: Pick<Task, "description" | "acceptanceCriteria">
): {
  result: string;
  resultDetails: TaskResultDetails;
  attachments: string[];
  actualHours?: number;
} {
  if (!rawBody || typeof rawBody !== "object") {
    throw new Error("请求体格式不正确");
  }

  const body = rawBody as Record<string, unknown>;
  const resultDetails: TaskResultDetails = {
    summary: requireNonEmptyString(body.summary, "summary"),
    implementation: requireNonEmptyString(body.implementation, "implementation"),
    verification: requireNonEmptyString(body.verification, "verification"),
    risks: requireNonEmptyString(body.risks, "risks"),
    acceptanceChecklist: normalizeChecklist(body.acceptanceChecklist),
  };

  const expectedCriteria = extractAcceptanceCriteria(task);
  if (expectedCriteria.length === 0) {
    throw new Error("任务缺少验收标准，不能提交结构化结果");
  }

  const checklistMap = new Map(
    resultDetails.acceptanceChecklist.map((item) => [normalizeCriterionKey(item.criterion), item])
  );
  const missingCriteria = expectedCriteria.filter((criterion) => !checklistMap.has(normalizeCriterionKey(criterion)));
  if (missingCriteria.length > 0) {
    throw new Error(`acceptanceChecklist 缺少验收项: ${missingCriteria.join("；")}`);
  }

  return {
    result: buildTaskResultMarkdown(resultDetails),
    resultDetails,
    attachments: normalizeAttachments(body.attachments),
    actualHours: normalizeActualHours(body.actualHours),
  };
}

export function normalizeAutomatedTaskResult(
  task: Pick<Task, "description" | "acceptanceCriteria">,
  responseText: string,
  parsedOutput?: unknown
): {
  result: string;
  resultDetails: TaskResultDetails;
} {
  const expectedCriteria = extractAcceptanceCriteria(task);
  if (expectedCriteria.length === 0) {
    throw new Error("任务缺少验收标准，自动调度不能提交结果");
  }

  const structuredPayload = extractStructuredPayload(parsedOutput)
    || extractStructuredPayload(responseText ? (() => {
      try {
        return JSON.parse(responseText);
      } catch {
        return null;
      }
    })() : null);

  const resultDetails = structuredPayload
    ? {
        summary: requireNonEmptyString(structuredPayload.summary, "summary"),
        implementation: requireNonEmptyString(structuredPayload.implementation, "implementation"),
        verification: requireNonEmptyString(structuredPayload.verification, "verification"),
        risks: requireNonEmptyString(structuredPayload.risks, "risks"),
        acceptanceChecklist: normalizeChecklist(structuredPayload.acceptanceChecklist),
      }
    : extractStructuredPayloadFromText(responseText, expectedCriteria);

  const checklistMap = new Map(
    resultDetails.acceptanceChecklist.map((item) => [normalizeCriterionKey(item.criterion), item])
  );
  const completedChecklist = expectedCriteria.map((criterion) => {
    const existing = checklistMap.get(normalizeCriterionKey(criterion));
    if (existing) {
      return {
        criterion,
        status: existing.status,
        evidence: existing.evidence,
      };
    }
    return {
      criterion,
      status: "partial" as const,
      evidence: "自动调度未返回该验收项的明确证据，请人工复核",
    };
  });

  const normalizedDetails: TaskResultDetails = {
    summary: resultDetails.summary,
    implementation: resultDetails.implementation,
    verification: resultDetails.verification,
    risks: resultDetails.risks,
    acceptanceChecklist: completedChecklist,
  };

  return {
    result: buildTaskResultMarkdown(normalizedDetails),
    resultDetails: normalizedDetails,
  };
}

export function getChecklistCompletion(
  acceptanceChecklist: TaskAcceptanceChecklistItem[] | undefined,
  criterion: string
): TaskAcceptanceChecklistItem | undefined {
  if (!acceptanceChecklist || acceptanceChecklist.length === 0) {
    return undefined;
  }
  const key = normalizeCriterionKey(criterion);
  return acceptanceChecklist.find((item) => normalizeCriterionKey(item.criterion) === key);
}

export function getChecklistStatusLabel(status: TaskAcceptanceChecklistStatus): string {
  return CHECKLIST_STATUS_LABELS[status];
}

export function summarizeChecklistEvidence(item: TaskAcceptanceChecklistItem): string {
  return normalizeText(item.evidence);
}
