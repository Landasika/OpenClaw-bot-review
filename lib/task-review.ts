import type { Task } from "./task-types";
import type { DependencyCheckResult } from "./task-dependency";
import { evaluateTaskDependencies } from "./task-dependency";
import { getChecklistCompletion } from "./task-result";
import { extractAcceptanceCriteria } from "./task-acceptance";

const STEP_OR_METHOD_REGEX = /(步骤|过程|实现|方法|方案|处理|排查|修改|修复|分析)/;
const VERIFICATION_REGEX = /(测试|验证|结果|输出|对比|检查|通过|截图|命令|日志)/;
const CONCLUSION_REGEX = /(结论|总结|结论摘要|最终结论|交付结果|完成情况)/;
const RISK_REGEX = /(风险|限制|边界|注意事项|遗留问题|待处理)/;

export interface ReviewAssessment {
  approved: boolean;
  score: number;
  comment: string;
  dependencyCheck: DependencyCheckResult;
  acceptanceCriteria: string[];
  acceptanceCoverage: number;
  unmetAcceptanceCriteria: string[];
}

const SIGNAL_STOPWORDS = new Set([
  "完成",
  "提供",
  "生成",
  "包含",
  "增加",
  "补充",
  "输出",
  "相关",
  "内容",
  "结果",
  "说明",
  "数据",
  "文件",
  "格式",
  "目录",
  "最终",
  "至少",
  "必须",
  "保存",
  "任务",
]);

function extractCriterionSignals(text: string): string[] {
  const lowered = text.toLowerCase();
  const matches = lowered.match(/[\u4e00-\u9fff]{2,}|[a-z0-9][a-z0-9/_\-.]{1,}/g) || [];
  const signals = matches
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .filter((item) => !SIGNAL_STOPWORDS.has(item));
  return Array.from(new Set(signals));
}

function criterionCovered(result: string, criterion: string): boolean {
  const normalizedResult = result.toLowerCase();
  const signals = extractCriterionSignals(criterion);

  const significantSignals = signals.filter((signal) => {
    if (/^\d+$/.test(signal)) {
      return false;
    }
    if (/[\u4e00-\u9fff]/.test(signal)) {
      return signal.length >= 3;
    }
    if (signal.length >= 4) {
      return true;
    }
    return /[a-z]/.test(signal);
  });

  if (significantSignals.length === 0) {
    const compact = criterion.replace(/\s+/g, "");
    return compact.length > 0 && normalizedResult.includes(compact.toLowerCase());
  }

  const matchedCount = significantSignals.filter((signal) => normalizedResult.includes(signal)).length;
  const threshold = Math.min(significantSignals.length, significantSignals.length >= 3 ? 2 : 1);
  return matchedCount >= threshold;
}

function formatDependencyIssues(result: DependencyCheckResult): string[] {
  return result.blockers.map((blocker) => `${blocker.title || blocker.taskId}(${blocker.status})`);
}

function dedup(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export function assessTaskReview(
  task: Task,
  taskMap: Map<string, Task>
): ReviewAssessment {
  const result = String(task.result || "").trim();
  const lines = result
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const resultLength = result.length;
  const paragraphCount = lines.length;
  const attachmentsCount = Array.isArray(task.attachments) ? task.attachments.filter(Boolean).length : 0;
  const hasData = /\d+/.test(result);
  const hasCodeBlock = /```/.test(result);
  const hasStepWords = STEP_OR_METHOD_REGEX.test(result);
  const hasVerification = VERIFICATION_REGEX.test(result);
  const hasConclusion = CONCLUSION_REGEX.test(result);
  const hasRiskOrLimit = RISK_REGEX.test(result);

  const dependencyCheck = evaluateTaskDependencies(task, taskMap);
  const acceptanceCriteria = extractAcceptanceCriteria(task);
  const unmetAcceptanceCriteria = acceptanceCriteria.filter((criterion) => {
    const checklistItem = getChecklistCompletion(task.resultDetails?.acceptanceChecklist, criterion);
    if (checklistItem) {
      return checklistItem.status !== "done" || checklistItem.evidence.trim() === "";
    }
    return !criterionCovered(result, criterion);
  });
  const acceptanceCoverage = acceptanceCriteria.length === 0
    ? 1
    : (acceptanceCriteria.length - unmetAcceptanceCriteria.length) / acceptanceCriteria.length;

  const strengths: string[] = [];
  const issues: string[] = [];
  const reasons: string[] = [];
  const nextSteps: string[] = [];
  const hardFailures: string[] = [];

  if (!dependencyCheck.satisfied) {
    const blockers = formatDependencyIssues(dependencyCheck);
    hardFailures.push(`依赖未全部通过: ${blockers.join(", ")}`);
    reasons.push(`当前任务存在未满足依赖，阻塞原因：${dependencyCheck.blockedReason}`);
    nextSteps.push("先修复依赖链，确保所有前置任务为 approved 后再提交审查");
  }

  if (resultLength >= 300) {
    strengths.push(`结果内容较完整（约 ${resultLength} 字）`);
  } else if (resultLength >= 180) {
    strengths.push(`结果具备基础完整性（约 ${resultLength} 字）`);
    issues.push(`结果深度仍偏浅（约 ${resultLength} 字）`);
    nextSteps.push("补充关键决策、产物位置和验证证据，避免只写概述");
  } else {
    hardFailures.push(`结果过短（仅约 ${resultLength} 字）`);
    reasons.push("结果未充分展开，无法支撑通过结论");
    nextSteps.push("按“结论、过程、验证、风险”至少四段补齐结果");
  }

  if (paragraphCount >= 4) {
    strengths.push(`结构较清晰（${paragraphCount} 段）`);
  } else {
    issues.push(`结构不足（仅 ${paragraphCount} 段）`);
    nextSteps.push("重写为至少四段：结论、过程、验证、风险/遗留问题");
  }

  if (hasStepWords || hasCodeBlock) {
    strengths.push("包含实现过程或关键操作说明");
  } else {
    hardFailures.push("缺少实现过程描述");
    reasons.push("无法核实任务是否真实执行");
    nextSteps.push("明确写出处理步骤、关键命令或核心改动");
  }

  if (hasVerification) {
    strengths.push("提供了验证或测试信息");
  } else {
    hardFailures.push("缺少验证证据");
    reasons.push("结果没有展示正确性验证");
    nextSteps.push("补充测试步骤、命令输出、截图说明或对比结果");
  }

  if (hasConclusion) {
    strengths.push("包含明确结论");
  } else {
    issues.push("缺少明确结论摘要");
    nextSteps.push("增加“结论摘要”或“交付结果”小节");
  }

  if (hasData || attachmentsCount > 0) {
    strengths.push(attachmentsCount > 0 ? `附带了 ${attachmentsCount} 个附件或产物引用` : "包含可核查数据");
  } else {
    hardFailures.push("缺少可核查证据");
    reasons.push("没有数据、附件或产物定位信息支撑结果");
    nextSteps.push("补充附件、文件路径、截图地址或量化结果");
  }

  if (!hasRiskOrLimit) {
    nextSteps.push("增加风险、限制或遗留问题说明，避免把未完成项包装成完成");
  }

  if (acceptanceCriteria.length > 0) {
    if (acceptanceCoverage >= 1) {
      strengths.push(`已覆盖全部验收标准（${acceptanceCriteria.length}/${acceptanceCriteria.length}）`);
    } else if (acceptanceCoverage >= 0.75) {
      issues.push(`仍有 ${unmetAcceptanceCriteria.length} 条验收标准未被明确覆盖`);
      nextSteps.push("逐条回应验收标准，避免只描述通用结果");
    } else {
      hardFailures.push(`验收标准覆盖不足（${acceptanceCriteria.length - unmetAcceptanceCriteria.length}/${acceptanceCriteria.length}）`);
      reasons.push("任务结果没有逐条覆盖验收要求");
      nextSteps.push(`补齐未覆盖的验收项：${unmetAcceptanceCriteria.slice(0, 3).join("；")}`);
    }
  } else {
    issues.push("任务缺少结构化验收标准");
    nextSteps.push("后续创建任务时单独填写 acceptanceCriteria，减少审查歧义");
  }

  let score = 1;
  if (resultLength >= 180) score += 1;
  if (paragraphCount >= 4) score += 1;
  if (hasStepWords || hasCodeBlock) score += 1;
  if (hasVerification) score += 1;
  if (hasData || attachmentsCount > 0) score += 1;
  if (acceptanceCoverage >= 0.75) score += 1;
  if (dependencyCheck.satisfied) score += 1;
  score = Math.max(1, Math.min(5, score));

  const approved = hardFailures.length === 0 && score >= 4;

  let comment = `审查结论：${approved ? "通过" : "驳回"}（${score}/5）\n\n`;
  comment += "为什么这样评价：\n";
  const strengthsFinal = dedup(strengths);
  comment += strengthsFinal.length > 0
    ? strengthsFinal.map((item) => `- ${item}`).join("\n")
    : "- 当前提交缺少足够的通过依据";
  comment += "\n\n";

  const issuesFinal = dedup([...hardFailures, ...issues]);
  if (issuesFinal.length > 0) {
    comment += "问题点：\n";
    comment += issuesFinal.map((item, index) => `${index + 1}. ${item}`).join("\n");
    comment += "\n\n";
  }

  const reasonsFinal = dedup(reasons);
  if (reasonsFinal.length > 0) {
    comment += "原因分析：\n";
    comment += reasonsFinal.map((item) => `- ${item}`).join("\n");
    comment += "\n\n";
  }

  if (unmetAcceptanceCriteria.length > 0) {
    comment += "未覆盖的验收标准：\n";
    comment += unmetAcceptanceCriteria.map((item, index) => `${index + 1}. ${item}`).join("\n");
    comment += "\n\n";
  }

  comment += approved ? "下一步优化建议：\n" : "下一步修改建议：\n";
  const nextStepsFinal = dedup(nextSteps);
  comment += nextStepsFinal.length > 0
    ? nextStepsFinal.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : approved
    ? "1. 保持当前标准，继续补充可复用模板和证据链。"
    : "1. 按验收标准逐项补齐后重新提交。";

  if (!approved) {
    comment += "\n\n重新提交通过标准：\n";
    comment += "1. 依赖任务全部为 approved。\n";
    comment += "2. 结果至少覆盖结论、过程、验证、风险四部分。\n";
    comment += "3. 必须提供可核查证据，并逐条回应验收标准。";
  }

  return {
    approved,
    score,
    comment,
    dependencyCheck,
    acceptanceCriteria,
    acceptanceCoverage,
    unmetAcceptanceCriteria,
  };
}
