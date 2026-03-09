import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { epicStore } from "./epic-store";
import {
  ensureEpicPromptFiles,
  readEpicPrompts,
  renderPromptTemplate,
} from "./epic-prompts";
import type {
  CreateEpicProjectInput,
  EpicIteration,
  EpicIterationTrigger,
  EpicPlannerOutput,
  EpicProject,
  EpicReviewIssue,
  EpicReviewerOutput,
  EpicTaskOperation,
  EpicTaskOperationResult,
  EpicTestPlanItem,
  EpicTestRunResult,
} from "./epic-types";
import type { Task, TaskPriority } from "./task-types";
import { taskStore } from "./task-store";
import {
  assertTaskDependenciesValid,
  buildTaskMap,
  canEditTaskDependencies,
  normalizeDependsOnTaskIds,
  resolveAssignmentStateByDependencies,
} from "./task-dependency";
import { dispatchTaskToAgent } from "./task-scheduler";
import { getDefaultAgentId, getSystemConfig } from "./system-config";
import { normalizeAgentId } from "./agent-id";
import * as FeishuNotifier from "./feishu-notifier";

const execFileAsync = promisify(execFile);

type AgentInvocationResult = {
  text: string;
  rawOutput: string;
  durationMs: number;
};

type EpicControlResult = {
  success: boolean;
  project?: EpicProject;
  iteration?: EpicIteration;
  reportMarkdown?: string;
  error?: string;
};

type RuntimeState = {
  running: boolean;
  inProgress: boolean;
  lastRunAt?: number;
  lastError?: string;
};

type TaskApplyResult = {
  results: EpicTaskOperationResult[];
  dispatchCandidates: Array<{ externalKey: string; task: Task; autoDispatch: boolean }>;
  updatedBindings: Record<string, string>;
};

const epicTimers = new Map<string, NodeJS.Timeout>();
const runningIterations = new Set<string>();
const runtimeState = new Map<string, RuntimeState>();

function normalizePriority(value: unknown): TaskPriority {
  if (value === "low" || value === "high" || value === "urgent") {
    return value;
  }
  return "medium";
}

function summarizeTask(task: Task): string {
  return `- ${task.id} | ${task.title} | ${task.status} | ${task.assignedTo || "未分配"}`;
}

function summarizeProjectTasks(bindings: Record<string, string>, taskMap: Map<string, Task>): string {
  const lines: string[] = [];
  for (const [externalKey, taskId] of Object.entries(bindings)) {
    const task = taskMap.get(taskId);
    if (!task) {
      lines.push(`- ${externalKey} -> ${taskId} (missing)`);
      continue;
    }
    lines.push(`- ${externalKey} -> ${task.id} (${task.status}, ${task.assignedTo || "未分配"})`);
  }
  return lines.length > 0 ? lines.join("\n") : "- 暂无绑定任务";
}

function pickJsonFromText(output: string): any {
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

  throw new Error("无法从 Agent 输出中解析 JSON");
}

function pickTextFromAgentOutput(rawOutput: string): string {
  try {
    const parsed = pickJsonFromText(rawOutput);
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
    // fallthrough
  }

  return rawOutput.trim();
}

async function invokeAgent(agentId: string, message: string): Promise<AgentInvocationResult> {
  const normalizedAgent = normalizeAgentId(agentId) || agentId;
  const start = Date.now();
  const { stdout, stderr } = await execFileAsync(
    "openclaw",
    ["agent", "--agent", normalizedAgent, "--message", message, "--json"],
    {
      timeout: 10 * 60 * 1000,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
    }
  );

  const rawOutput = `${String(stdout)}\n${String(stderr || "")}`.trim();
  return {
    text: pickTextFromAgentOutput(rawOutput),
    rawOutput,
    durationMs: Date.now() - start,
  };
}

function parsePlannerOutput(rawText: string): EpicPlannerOutput {
  const parsed = pickJsonFromText(rawText);

  const taskOperations: EpicTaskOperation[] = Array.isArray(parsed?.taskOperations)
    ? parsed.taskOperations
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: any) => ({
        externalKey: String(item.externalKey || "").trim(),
        title: String(item.title || "").trim(),
        description: String(item.description || "").trim(),
        acceptanceCriteria: String(item.acceptanceCriteria || "").trim(),
        priority: normalizePriority(item.priority),
        assignedTo: typeof item.assignedTo === "string" ? item.assignedTo.trim() : undefined,
        dependsOnExternalKeys: Array.isArray(item.dependsOnExternalKeys)
          ? item.dependsOnExternalKeys.map((v: unknown) => String(v || "").trim()).filter(Boolean)
          : [],
        tags: Array.isArray(item.tags)
          ? item.tags.map((v: unknown) => String(v || "").trim()).filter(Boolean)
          : [],
        estimatedHours: Number.isFinite(item.estimatedHours) ? Number(item.estimatedHours) : undefined,
        autoDispatch: item.autoDispatch !== false,
      }))
      .filter((item: EpicTaskOperation) =>
        item.externalKey && item.title && item.description && item.acceptanceCriteria
      )
    : [];

  const testPlan: EpicTestPlanItem[] = Array.isArray(parsed?.testPlan)
    ? parsed.testPlan
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: any) => ({
        agentId: String(item.agentId || "").trim(),
        objective: String(item.objective || "").trim(),
        prompt: String(item.prompt || "").trim(),
        maxCalls: Number.isFinite(item.maxCalls) ? Math.max(1, Math.floor(item.maxCalls)) : 1,
      }))
      .filter((item: EpicTestPlanItem) => item.agentId && item.objective && item.prompt)
    : [];

  return {
    iterationGoal: String(parsed?.iterationGoal || "").trim(),
    taskOperations,
    testPlan,
    optimizationHypotheses: Array.isArray(parsed?.optimizationHypotheses)
      ? parsed.optimizationHypotheses.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [],
    exitSignals: Array.isArray(parsed?.exitSignals)
      ? parsed.exitSignals.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [],
  };
}

function parseReviewerOutput(rawText: string): EpicReviewerOutput {
  const parsed = pickJsonFromText(rawText);
  const issues: EpicReviewIssue[] = Array.isArray(parsed?.issues)
    ? parsed.issues
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: any) => ({
        problem: String(item.problem || "").trim(),
        evidence: String(item.evidence || "").trim(),
        suggestion: String(item.suggestion || "").trim(),
        acceptance: String(item.acceptance || "").trim(),
      }))
      .filter((item: EpicReviewIssue) => item.problem && item.suggestion)
    : [];

  return {
    goNoGo: parsed?.goNoGo === "stop" ? "stop" : "go",
    overallProgress: String(parsed?.overallProgress || "").trim(),
    issues,
    nextRoundFocus: Array.isArray(parsed?.nextRoundFocus)
      ? parsed.nextRoundFocus.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [],
    reportMarkdown: String(parsed?.reportMarkdown || "").trim(),
  };
}

function mergeCallStats(
  base: Record<string, number>,
  delta: Record<string, number>
): Record<string, number> {
  const output: Record<string, number> = { ...base };
  for (const [agentId, count] of Object.entries(delta)) {
    output[agentId] = (output[agentId] || 0) + count;
  }
  return output;
}

function hasCallBudget(project: EpicProject, iterationCallsUsed: number, nextCalls = 1): boolean {
  if (project.callLimitTotal === null) {
    return true;
  }
  return project.totalCallsUsed + iterationCallsUsed + nextCalls <= project.callLimitTotal;
}

function getRemainingCallBudget(project: EpicProject): number | null {
  if (project.callLimitTotal === null) {
    return null;
  }
  return Math.max(0, project.callLimitTotal - project.totalCallsUsed);
}

function getElapsedDurationMs(project: EpicProject): number {
  if (!project.startedAt) {
    return 0;
  }
  return Math.max(0, Date.now() - project.startedAt);
}

function getRemainingDurationMs(project: EpicProject): number | null {
  if (project.durationLimitMs === null) {
    return null;
  }
  return Math.max(0, project.durationLimitMs - getElapsedDurationMs(project));
}

function getLimitExceededReason(project: EpicProject): string | null {
  if (project.callLimitTotal !== null && project.totalCallsUsed >= project.callLimitTotal) {
    return "调用预算已耗尽";
  }

  if (project.durationLimitMs !== null && project.startedAt) {
    const elapsed = Date.now() - project.startedAt;
    if (elapsed >= project.durationLimitMs) {
      return "运行时长已达到上限";
    }
  }

  return null;
}

function clearEpicTimer(epicId: string): void {
  const timer = epicTimers.get(epicId);
  if (timer) {
    clearInterval(timer);
    epicTimers.delete(epicId);
  }
}

function setRuntime(epicId: string, patch: Partial<RuntimeState>): void {
  const current = runtimeState.get(epicId) || {
    running: epicTimers.has(epicId),
    inProgress: runningIterations.has(epicId),
  };
  runtimeState.set(epicId, {
    ...current,
    ...patch,
  });
}

function buildExecutionSummary(
  operationResults: EpicTaskOperationResult[],
  testRuns: EpicTestRunResult[]
): string {
  const lines: string[] = [];
  lines.push("任务落地结果：");
  if (operationResults.length === 0) {
    lines.push("- 本轮没有任务落地操作");
  } else {
    for (const item of operationResults) {
      lines.push(`- [${item.action}] ${item.externalKey} -> ${item.taskId || "-"} ${item.message || ""}`.trim());
    }
  }

  lines.push("");
  lines.push("测试调用结果：");
  if (testRuns.length === 0) {
    lines.push("- 本轮没有测试调用");
  } else {
    for (const test of testRuns) {
      lines.push(`- ${test.agentId} | ${test.objective} | ${test.success ? "成功" : "失败"} | ${test.durationMs}ms`);
    }
  }

  return lines.join("\n");
}

function formatIterationSummaryPath(epicId: string, iterationNo: number): string {
  const reportDir = epicStore.getReportDirPath(epicId);
  return path.join(reportDir, `iteration-${String(iterationNo).padStart(4, "0")}-summary.md`);
}

function writeIterationSummaryDocument(
  project: EpicProject,
  iterationNo: number,
  reportMarkdown: string,
  operationResults: EpicTaskOperationResult[],
  testRuns: EpicTestRunResult[],
  reviewerOutput?: EpicReviewerOutput,
  iterationError?: string
): { path: string; generatedAt: number } {
  const generatedAt = Date.now();
  const filePath = formatIterationSummaryPath(project.id, iterationNo);
  const reportDir = path.dirname(filePath);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const actionCounts = operationResults.reduce<Record<string, number>>((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});
  const successfulTests = testRuns.filter((item) => item.success).length;
  const failedTests = testRuns.length - successfulTests;

  const lines: string[] = [
    `# ${project.title} - 第${iterationNo}轮总结文档`,
    "",
    `- 大任务 ID：${project.id}`,
    `- 轮次：${iterationNo}`,
    `- 生成时间：${new Date(generatedAt).toLocaleString("zh-CN")}`,
    `- 总结文档路径：${filePath}`,
    "",
    "## 总体进展",
    reviewerOutput?.overallProgress || iterationError || "暂无总体进展总结",
    "",
    "## 本轮做了什么",
    operationResults.length > 0
      ? `- 任务落地：创建 ${actionCounts.created || 0}，更新 ${actionCounts.updated || 0}，跳过 ${actionCounts.skipped || 0}，失败 ${actionCounts.failed || 0}`
      : "- 本轮没有新增任务落地动作",
    testRuns.length > 0
      ? `- 测试验证：共 ${testRuns.length} 次，成功 ${successfulTests} 次，失败 ${failedTests} 次`
      : "- 本轮没有额外测试验证",
  ];

  if (operationResults.length > 0) {
    lines.push("", "### 关键任务动作");
    for (const item of operationResults) {
      lines.push(`- [${item.action}] ${item.externalKey} -> ${item.taskId || "-"} ${item.message || ""}`.trim());
    }
  }

  if (testRuns.length > 0) {
    lines.push("", "### 测试验证");
    for (const test of testRuns) {
      lines.push(`- ${test.agentId} | ${test.objective} | ${test.success ? "成功" : "失败"} | ${test.durationMs}ms`);
    }
  }

  lines.push("", "## 下一步建议");
  if (reviewerOutput?.nextRoundFocus?.length) {
    for (const item of reviewerOutput.nextRoundFocus) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push(`- ${iterationError ? "先处理本轮失败原因，再恢复迭代" : "按当前目标继续推进下一轮"}`);
  }

  lines.push("", "## 详细总结", reportMarkdown || "暂无详细总结");

  fs.writeFileSync(filePath, `${lines.join("\n").trim()}\n`, "utf-8");

  return {
    path: filePath,
    generatedAt,
  };
}

async function applyTaskOperations(
  project: EpicProject,
  operations: EpicTaskOperation[]
): Promise<TaskApplyResult> {
  const results: EpicTaskOperationResult[] = [];
  const dispatchCandidates: Array<{ externalKey: string; task: Task; autoDispatch: boolean }> = [];

  const allTasks = await taskStore.listTasks();
  const taskMap = buildTaskMap(allTasks);
  const bindings: Record<string, string> = { ...project.taskBindings };
  const createdBy = normalizeAgentId(project.ownerAgentId) || project.ownerAgentId;

  for (const op of operations) {
    const externalKey = op.externalKey.trim();
    if (!externalKey) {
      results.push({
        externalKey: "",
        action: "failed",
        message: "缺少 externalKey",
      });
      continue;
    }

    const dependsOnExternalKeys = Array.isArray(op.dependsOnExternalKeys)
      ? op.dependsOnExternalKeys.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const dependsOnTaskIds: string[] = [];
    let depMissing = false;
    for (const depKey of dependsOnExternalKeys) {
      const depTaskId = bindings[depKey];
      if (!depTaskId) {
        depMissing = true;
        results.push({
          externalKey,
          action: "failed",
          message: `依赖 externalKey 不存在: ${depKey}`,
        });
        break;
      }
      dependsOnTaskIds.push(depTaskId);
    }
    if (depMissing) {
      continue;
    }

    const normalizedDependsOnTaskIds = normalizeDependsOnTaskIds(dependsOnTaskIds);
    const assignedTo = normalizeAgentId(op.assignedTo) || undefined;
    const description = `${op.description}\n\n【验收标准】\n${op.acceptanceCriteria}`;
    const priority = normalizePriority(op.priority);
    const tags = Array.isArray(op.tags)
      ? op.tags.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const estimatedHours = Number.isFinite(op.estimatedHours)
      ? Number(op.estimatedHours)
      : undefined;
    const autoDispatch = op.autoDispatch !== false;

    const existingTaskId = bindings[externalKey];
    const existingTask = existingTaskId ? taskMap.get(existingTaskId) : undefined;

    if (existingTask) {
      if (!canEditTaskDependencies(existingTask.status)) {
        results.push({
          externalKey,
          taskId: existingTask.id,
          action: "skipped",
          status: existingTask.status,
          message: `任务状态 ${existingTask.status} 不允许覆盖更新`,
        });
        continue;
      }

      try {
        assertTaskDependenciesValid(existingTask.id, normalizedDependsOnTaskIds, taskMap);

        const nextTask = {
          ...existingTask,
          title: op.title,
          description,
          priority,
          assignedTo,
          tags,
          estimatedHours,
          dependsOnTaskIds: normalizedDependsOnTaskIds,
        };
        taskMap.set(existingTask.id, nextTask);

        const updates: Partial<Task> = {
          title: op.title,
          description,
          priority,
          assignedTo,
          tags,
          estimatedHours,
          dependsOnTaskIds: normalizedDependsOnTaskIds,
        };

        if (assignedTo) {
          const assignment = resolveAssignmentStateByDependencies(nextTask, taskMap);
          updates.status = assignment.status;
          updates.blockedReason = assignment.blockedReason;
        } else {
          updates.status = "pending";
          updates.blockedReason = undefined;
        }

        const updated = await taskStore.updateTask(existingTask.id, updates);
        if (!updated) {
          results.push({
            externalKey,
            taskId: existingTask.id,
            action: "failed",
            message: "更新任务失败",
          });
          continue;
        }

        taskMap.set(updated.id, updated);
        results.push({
          externalKey,
          taskId: updated.id,
          action: "updated",
          status: updated.status,
          message: "任务已更新",
        });
        dispatchCandidates.push({ externalKey, task: updated, autoDispatch });
      } catch (error: any) {
        results.push({
          externalKey,
          taskId: existingTask.id,
          action: "failed",
          message: error.message || "更新失败",
        });
      }
      continue;
    }

    try {
      const taskId = taskStore.generateId();
      assertTaskDependenciesValid(taskId, normalizedDependsOnTaskIds, taskMap);

      let status: Task["status"] = "pending";
      let blockedReason: string | undefined;
      if (assignedTo) {
        const assignment = resolveAssignmentStateByDependencies(
          { dependsOnTaskIds: normalizedDependsOnTaskIds },
          taskMap
        );
        status = assignment.status;
        blockedReason = assignment.blockedReason;
      }

      const now = Date.now();
      const created = await taskStore.createTask({
        id: taskId,
        title: op.title,
        description,
        acceptanceCriteria: op.acceptanceCriteria,
        status,
        priority,
        assignedTo,
        createdBy,
        createdAt: now,
        updatedAt: now,
        dependsOnTaskIds: normalizedDependsOnTaskIds,
        blockedReason,
        tags,
        estimatedHours,
      });

      taskMap.set(created.id, created);
      bindings[externalKey] = created.id;
      results.push({
        externalKey,
        taskId: created.id,
        action: "created",
        status: created.status,
        message: "任务已创建",
      });
      dispatchCandidates.push({ externalKey, task: created, autoDispatch });
    } catch (error: any) {
      results.push({
        externalKey,
        action: "failed",
        message: error.message || "创建失败",
      });
    }
  }

  return {
    results,
    dispatchCandidates,
    updatedBindings: bindings,
  };
}

function buildFallbackProgressReport(project: EpicProject, recentIterations: EpicIteration[]): string {
  const remainingCalls = project.callLimitTotal === null
    ? "无限"
    : Math.max(0, project.callLimitTotal - project.totalCallsUsed).toString();
  const remainingDuration = project.durationLimitMs === null
    ? "无限"
    : `${Math.max(0, project.durationLimitMs - getElapsedDurationMs(project))} ms`;

  return [
    `# 大项进度汇报：${project.title}`,
    "",
    "## 总体进度",
    `- 当前状态：${project.status}`,
    `- 已完成轮次：${project.iterationsCompleted}`,
    "",
    "## 本轮做了什么",
    recentIterations.length > 0
      ? `- 最新轮次：第 ${recentIterations[0].iterationNo} 轮（${recentIterations[0].status}）`
      : "- 暂无迭代记录",
    "",
    "## 风险与阻塞",
    recentIterations.length > 0 && recentIterations[0].error
      ? `- ${recentIterations[0].error}`
      : "- 暂无显著阻塞",
    "",
    "## 下一步建议",
    recentIterations.length > 0 && recentIterations[0].reviewerOutput?.nextRoundFocus?.length
      ? recentIterations[0].reviewerOutput.nextRoundFocus.map((item) => `- ${item}`).join("\n")
      : "- 按当前目标继续迭代并关注失败项",
    "",
    "## 预算剩余",
    `- 调用次数剩余：${remainingCalls}`,
    `- 时长剩余：${remainingDuration}`,
  ].join("\n");
}

async function runSingleIteration(
  epicId: string,
  trigger: EpicIterationTrigger,
  options?: { ignoreStatus?: boolean }
): Promise<EpicControlResult> {
  if (runningIterations.has(epicId)) {
    return {
      success: false,
      error: "该大项已有迭代在执行中",
    };
  }

  let project = await epicStore.getProject(epicId);
  if (!project) {
    return {
      success: false,
      error: "大项不存在",
    };
  }

  const ignoreStatus = options?.ignoreStatus === true;
  if (!ignoreStatus && project.status !== "running" && project.status !== "stopping") {
    return {
      success: false,
      error: `当前状态 ${project.status} 不允许执行迭代`,
    };
  }

  if (project.stopRequested && !ignoreStatus) {
    const stopped = await epicStore.updateProject(project.id, {
      status: "stopped",
      stopRequested: false,
      stoppedAt: Date.now(),
    });
    clearEpicTimer(project.id);
    setRuntime(project.id, {
      running: false,
      inProgress: false,
      lastRunAt: Date.now(),
    });
    return {
      success: true,
      project: stopped || project,
      error: "已收到停止指令，未开启新迭代",
    };
  }

  const exceededReason = getLimitExceededReason(project);
  if (exceededReason) {
    const completed = await epicStore.updateProject(project.id, {
      status: "completed",
      stopRequested: false,
      stoppedAt: Date.now(),
    });
    clearEpicTimer(project.id);
    setRuntime(project.id, {
      running: false,
      inProgress: false,
      lastError: exceededReason,
      lastRunAt: Date.now(),
    });
    return {
      success: false,
      project: completed || project,
      error: exceededReason,
    };
  }

  runningIterations.add(project.id);
  setRuntime(project.id, {
    running: epicTimers.has(project.id),
    inProgress: true,
  });

  let plannerPrompt = "";
  let plannerRawResponse = "";
  let reviewerPrompt = "";
  let reviewerRawResponse = "";
  let plannerOutput: EpicPlannerOutput | undefined;
  let reviewerOutput: EpicReviewerOutput | undefined;
  let taskOperationResults: EpicTaskOperationResult[] = [];
  let testRuns: EpicTestRunResult[] = [];
  let reportMarkdown = "";
  let summaryDocumentPath: string | undefined;
  let summaryGeneratedAt: number | undefined;
  let updatedBindings: Record<string, string> = { ...project.taskBindings };
  let iterationError: string | undefined;

  const iterationCallsByAgent: Record<string, number> = {};
  let iterationCallsUsed = 0;

  const markCall = (agentId: string): void => {
    const normalized = normalizeAgentId(agentId) || agentId;
    iterationCallsUsed += 1;
    iterationCallsByAgent[normalized] = (iterationCallsByAgent[normalized] || 0) + 1;
  };

  const iterationStartedAt = Date.now();
  const latestIteration = await epicStore.getLatestIteration(project.id);
  const iterationNo = (latestIteration?.iterationNo || 0) + 1;
  const config = getSystemConfig();
  const availableAgents = Array.isArray(config.availableAgents) ? config.availableAgents : [];
  const normalizedOwner = normalizeAgentId(project.ownerAgentId) || project.ownerAgentId || getDefaultAgentId();

  try {
    const allTasks = await taskStore.listTasks();
    const taskMap = buildTaskMap(allTasks);
    const boundTasks = Object.values(project.taskBindings)
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is Task => !!task);

    const { prompts } = readEpicPrompts(project.promptFiles);
    const lastIterationSummary = latestIteration
      ? latestIteration.reportMarkdown || "(空)"
      : "无";
    const lastIterationOverview = latestIteration?.reviewerOutput?.overallProgress
      || latestIteration?.error
      || "无";
    const lastIterationNextRoundFocus = latestIteration?.reviewerOutput?.nextRoundFocus?.length
      ? latestIteration.reviewerOutput.nextRoundFocus.map((item) => `- ${item}`).join("\n")
      : "- 无";

    plannerPrompt = renderPromptTemplate(prompts.planner, {
      ownerAgentId: normalizedOwner,
      epicTitle: project.title,
      objective: project.objective,
      successCriteria: project.successCriteria,
      frameworkPrompt: project.frameworkPrompt,
      iterationNo,
      now: new Date().toLocaleString("zh-CN"),
      remainingDurationMs: String(getRemainingDurationMs(project)),
      remainingCallBudget: String(getRemainingCallBudget(project)),
      taskBindingsSummary: summarizeProjectTasks(project.taskBindings, taskMap),
      lastIterationSummaryDocumentPath: latestIteration?.summaryDocumentPath || "无",
      lastIterationOverview,
      lastIterationNextRoundFocus,
      lastIterationSummary,
    });

    if (!hasCallBudget(project, iterationCallsUsed, 1)) {
      throw new Error("调用预算不足，无法执行规划");
    }

    const plannerResult = await invokeAgent(normalizedOwner, plannerPrompt);
    markCall(normalizedOwner);
    plannerRawResponse = plannerResult.text || plannerResult.rawOutput;
    plannerOutput = parsePlannerOutput(plannerRawResponse);

    const operationApplyResult = await applyTaskOperations(project, plannerOutput.taskOperations);
    taskOperationResults = operationApplyResult.results;
    updatedBindings = operationApplyResult.updatedBindings;

    for (const candidate of operationApplyResult.dispatchCandidates) {
      if (!candidate.autoDispatch) {
        continue;
      }
      if (!candidate.task.assignedTo) {
        continue;
      }
      if (candidate.task.status === "blocked") {
        taskOperationResults.push({
          externalKey: candidate.externalKey,
          taskId: candidate.task.id,
          action: "skipped",
          status: candidate.task.status,
          message: candidate.task.blockedReason || "依赖未满足，跳过下发",
        });
        continue;
      }
      if (candidate.task.status !== "assigned") {
        continue;
      }
      if (!hasCallBudget(project, iterationCallsUsed, 1)) {
        taskOperationResults.push({
          externalKey: candidate.externalKey,
          taskId: candidate.task.id,
          action: "skipped",
          status: candidate.task.status,
          message: "调用预算不足，跳过下发",
        });
        continue;
      }

      const dispatchResult = await dispatchTaskToAgent(
        candidate.task.id,
        candidate.task.assignedTo,
        `大项任务(${project.title})子任务:\n${candidate.task.title}\n\n${candidate.task.description}`,
        { waitForIdle: true }
      );
      markCall(candidate.task.assignedTo);

      taskOperationResults.push({
        externalKey: candidate.externalKey,
        taskId: candidate.task.id,
        action: dispatchResult.success ? "updated" : "failed",
        status: dispatchResult.success ? "submitted" : "cancelled",
        message: dispatchResult.success
          ? "任务已下发"
          : `下发失败: ${dispatchResult.error || "未知错误"}`,
      });
    }

    for (const testItem of plannerOutput.testPlan) {
      const normalizedAgent = normalizeAgentId(testItem.agentId) || testItem.agentId;
      if (!normalizedAgent || !availableAgents.includes(normalizedAgent)) {
        testRuns.push({
          agentId: normalizedAgent || testItem.agentId || "unknown",
          objective: testItem.objective,
          success: false,
          durationMs: 0,
          error: "agentId 不在可用列表中",
        });
        continue;
      }

      const totalCalls = Math.max(1, Math.min(3, testItem.maxCalls || 1));
      for (let i = 0; i < totalCalls; i++) {
        if (!hasCallBudget(project, iterationCallsUsed, 1)) {
          testRuns.push({
            agentId: normalizedAgent,
            objective: testItem.objective,
            success: false,
            durationMs: 0,
            error: "调用预算不足，跳过测试",
          });
          break;
        }

        const testPrompt = `【大项任务迭代测试】\n大项: ${project.title}\n测试目标: ${testItem.objective}\n请给出测试结论、发现问题和改进建议。\n\n补充指令:\n${testItem.prompt}`;
        const started = Date.now();
        try {
          const runResult = await invokeAgent(normalizedAgent, testPrompt);
          markCall(normalizedAgent);
          testRuns.push({
            agentId: normalizedAgent,
            objective: testItem.objective,
            success: true,
            durationMs: Date.now() - started,
            response: runResult.text,
          });
        } catch (error: any) {
          testRuns.push({
            agentId: normalizedAgent,
            objective: testItem.objective,
            success: false,
            durationMs: Date.now() - started,
            error: error.message || "测试调用失败",
          });
        }
      }
    }

    reviewerPrompt = renderPromptTemplate(prompts.reviewer, {
      ownerAgentId: normalizedOwner,
      epicTitle: project.title,
      objective: project.objective,
      successCriteria: project.successCriteria,
      iterationExecutionSummary: buildExecutionSummary(taskOperationResults, testRuns),
      iterationCallsUsed: iterationCallsUsed,
      totalCallsUsed: project.totalCallsUsed + iterationCallsUsed,
      callLimitTotal: String(project.callLimitTotal),
    });

    if (hasCallBudget(project, iterationCallsUsed, 1)) {
      const reviewerResult = await invokeAgent(normalizedOwner, reviewerPrompt);
      markCall(normalizedOwner);
      reviewerRawResponse = reviewerResult.text || reviewerResult.rawOutput;
      reviewerOutput = parseReviewerOutput(reviewerRawResponse);
      reportMarkdown = reviewerOutput.reportMarkdown;
    } else {
      reviewerRawResponse = "调用预算不足，跳过 Reviewer 调用。";
      reviewerOutput = {
        goNoGo: "stop",
        overallProgress: "调用预算已耗尽",
        issues: [],
        nextRoundFocus: ["扩充预算后继续迭代"],
        reportMarkdown: "",
      };
    }
  } catch (error: any) {
    iterationError = error.message || "迭代执行失败";
    reportMarkdown = [
      `# 大项迭代失败`,
      "",
      `- 大项: ${project.title}`,
      `- 轮次: ${iterationNo}`,
      `- 错误: ${iterationError}`,
    ].join("\n");
  }

  const iterationEndedAt = Date.now();
  if (!reportMarkdown) {
    reportMarkdown = buildFallbackProgressReport(project, latestIteration ? [latestIteration] : []);
  }

  try {
    const summaryDoc = writeIterationSummaryDocument(
      project,
      iterationNo,
      reportMarkdown,
      taskOperationResults,
      testRuns,
      reviewerOutput,
      iterationError
    );
    summaryDocumentPath = summaryDoc.path;
    summaryGeneratedAt = summaryDoc.generatedAt;
  } catch (error: any) {
    iterationError = iterationError || `写入总结文档失败: ${error.message || String(error)}`;
  }

  const iteration: EpicIteration = {
    id: epicStore.generateIterationId(project.id, iterationNo),
    epicId: project.id,
    iterationNo,
    trigger,
    status: iterationError ? "failed" : "completed",
    startedAt: iterationStartedAt,
    endedAt: iterationEndedAt,
    plannerPrompt,
    plannerRawResponse,
    plannerOutput,
    taskOperationResults,
    testRuns,
    reviewerPrompt,
    reviewerRawResponse,
    reviewerOutput,
    reportMarkdown,
    summaryDocumentPath,
    summaryGeneratedAt,
    callsUsed: iterationCallsUsed,
    callsByAgent: iterationCallsByAgent,
    error: iterationError,
  };
  await epicStore.appendIteration(project.id, iteration);

  project = (await epicStore.getProject(project.id)) || project;
  const mergedCallsByAgent = mergeCallStats(project.callsByAgent, iterationCallsByAgent);
  const totalCallsUsed = project.totalCallsUsed + iterationCallsUsed;

  let nextStatus = project.status;
  let nextStopRequested = project.stopRequested;
  let stoppedAt = project.stoppedAt;

  if (iterationError) {
    nextStatus = "failed";
    nextStopRequested = false;
    stoppedAt = Date.now();
    clearEpicTimer(project.id);
  } else if (reviewerOutput?.goNoGo === "stop") {
    nextStatus = "completed";
    nextStopRequested = false;
    stoppedAt = Date.now();
    clearEpicTimer(project.id);
  } else if (project.stopRequested || project.status === "stopping") {
    nextStatus = "stopped";
    nextStopRequested = false;
    stoppedAt = Date.now();
    clearEpicTimer(project.id);
  } else {
    const nextProjectSnapshot: EpicProject = {
      ...project,
      totalCallsUsed,
      callLimitTotal: project.callLimitTotal,
      durationLimitMs: project.durationLimitMs,
    };
    const limitReasonAfterIteration = getLimitExceededReason(nextProjectSnapshot);
    if (limitReasonAfterIteration) {
      nextStatus = "completed";
      nextStopRequested = false;
      stoppedAt = Date.now();
      clearEpicTimer(project.id);
      setRuntime(project.id, {
        lastError: limitReasonAfterIteration,
      });
    } else if (project.status === "running") {
      nextStatus = "running";
      nextStopRequested = false;
    } else {
      nextStatus = project.status;
    }
  }

  const updatedProject = await epicStore.updateProject(project.id, {
    ownerAgentId: normalizedOwner,
    status: nextStatus,
    stopRequested: nextStopRequested,
    stoppedAt,
    startedAt: project.startedAt || iterationStartedAt,
    lastIterationAt: iterationEndedAt,
    totalCallsUsed,
    callsByAgent: mergedCallsByAgent,
    iterationsCompleted: project.iterationsCompleted + (iteration.status === "completed" ? 1 : 0),
    taskBindings: updatedBindings,
    latestReportMarkdown: reportMarkdown,
    latestSummaryDocumentPath: summaryDocumentPath,
    latestSummaryGeneratedAt: summaryGeneratedAt,
  });

  runningIterations.delete(project.id);
  setRuntime(project.id, {
    running: epicTimers.has(project.id),
    inProgress: false,
    lastRunAt: Date.now(),
    lastError: iterationError,
  });

  return {
    success: !iterationError,
    project: updatedProject || project,
    iteration,
    error: iterationError,
  };
}

function scheduleLoopForProject(project: EpicProject): void {
  clearEpicTimer(project.id);
  const interval = Math.max(10, Math.floor(project.loopIntervalSeconds || 300));
  const timer = setInterval(() => {
    void runSingleIteration(project.id, "scheduled");
  }, interval * 1000);
  epicTimers.set(project.id, timer);
  setRuntime(project.id, {
    running: true,
    inProgress: runningIterations.has(project.id),
  });
}

export async function createEpicProject(input: {
  title: string;
  frameworkPrompt: string;
  objective: string;
  successCriteria: string;
  ownerAgentId?: string;
  loopIntervalSeconds?: number;
  durationLimitMs?: number | null;
  callLimitTotal?: number | null;
  promptFiles?: Partial<EpicProject["promptFiles"]>;
}): Promise<EpicProject> {
  const owner = normalizeAgentId(input.ownerAgentId) || getDefaultAgentId();
  const loopIntervalSeconds = Math.max(10, Math.floor(input.loopIntervalSeconds || 300));
  const promptFiles = ensureEpicPromptFiles(input.promptFiles);

  const createInput: CreateEpicProjectInput = {
    title: input.title.trim(),
    frameworkPrompt: input.frameworkPrompt.trim(),
    objective: input.objective.trim(),
    successCriteria: input.successCriteria.trim(),
    ownerAgentId: owner,
    loopIntervalSeconds,
    durationLimitMs: input.durationLimitMs ?? null,
    callLimitTotal: input.callLimitTotal ?? null,
    promptFiles,
  };

  return epicStore.createProject(createInput);
}

export async function startEpicLoop(epicId: string): Promise<EpicControlResult> {
  const project = await epicStore.getProject(epicId);
  if (!project) {
    return {
      success: false,
      error: "大项不存在",
    };
  }

  const updated = await epicStore.updateProject(epicId, {
    status: "running",
    stopRequested: false,
    startedAt: project.startedAt || Date.now(),
    stoppedAt: undefined,
  });
  if (!updated) {
    return {
      success: false,
      error: "更新大项状态失败",
    };
  }

  scheduleLoopForProject(updated);
  setTimeout(() => {
    void runSingleIteration(updated.id, "manual");
  }, 10);

  return {
    success: true,
    project: updated,
  };
}

export async function stopEpicLoop(epicId: string): Promise<EpicControlResult> {
  const project = await epicStore.getProject(epicId);
  if (!project) {
    return {
      success: false,
      error: "大项不存在",
    };
  }

  if (!runningIterations.has(epicId)) {
    clearEpicTimer(epicId);
    const stopped = await epicStore.updateProject(epicId, {
      status: "stopped",
      stopRequested: false,
      stoppedAt: Date.now(),
    });
    setRuntime(epicId, {
      running: false,
      inProgress: false,
      lastRunAt: Date.now(),
    });
    return {
      success: true,
      project: stopped || project,
    };
  }

  const stopping = await epicStore.updateProject(epicId, {
    status: "stopping",
    stopRequested: true,
  });
  return {
    success: true,
    project: stopping || project,
  };
}

export async function runEpicIterationOnce(epicId: string): Promise<EpicControlResult> {
  return runSingleIteration(epicId, "manual", { ignoreStatus: true });
}

export async function generateEpicProgressReport(epicId: string): Promise<EpicControlResult> {
  const project = await epicStore.getProject(epicId);
  if (!project) {
    return {
      success: false,
      error: "大项不存在",
    };
  }

  const recentIterations = await epicStore.listIterations(epicId, 5);
  const { prompts } = readEpicPrompts(project.promptFiles);

  const recentIterationSummary = recentIterations.length > 0
    ? recentIterations
      .map((item) => `- 第${item.iterationNo}轮 | ${item.status} | calls=${item.callsUsed}\n${item.reportMarkdown || ""}`)
      .join("\n\n")
    : "- 暂无迭代";

  const reportPrompt = renderPromptTemplate(prompts.report, {
    ownerAgentId: project.ownerAgentId,
    epicTitle: project.title,
    objective: project.objective,
    successCriteria: project.successCriteria,
    epicStatus: project.status,
    iterationsCompleted: project.iterationsCompleted,
    totalCallsUsed: project.totalCallsUsed,
    callLimitTotal: String(project.callLimitTotal),
    elapsedDurationMs: getElapsedDurationMs(project),
    durationLimitMs: String(project.durationLimitMs),
    recentIterationSummary,
  });

  let reportMarkdown = "";
  try {
    const result = await invokeAgent(project.ownerAgentId, reportPrompt);
    reportMarkdown = result.text || buildFallbackProgressReport(project, recentIterations);
  } catch {
    reportMarkdown = buildFallbackProgressReport(project, recentIterations);
  }

  const updated = await epicStore.updateProject(epicId, {
    latestReportMarkdown: reportMarkdown,
  });

  await FeishuNotifier.notifyEpicProgress(project.title, reportMarkdown);

  return {
    success: true,
    project: updated || project,
    reportMarkdown,
  };
}

export async function updateEpicProject(
  epicId: string,
  updates: Partial<Omit<EpicProject, "id" | "createdAt" | "updatedAt">>
): Promise<EpicProject | null> {
  const current = await epicStore.getProject(epicId);
  if (!current) {
    return null;
  }

  const patch: Partial<EpicProject> = { ...updates };

  if (typeof updates.loopIntervalSeconds === "number") {
    patch.loopIntervalSeconds = Math.max(10, Math.floor(updates.loopIntervalSeconds));
  }

  if (updates.ownerAgentId !== undefined) {
    patch.ownerAgentId = normalizeAgentId(updates.ownerAgentId) || current.ownerAgentId;
  }

  if (updates.promptFiles) {
    patch.promptFiles = ensureEpicPromptFiles(updates.promptFiles);
  }

  const updated = await epicStore.updateProject(epicId, patch);
  if (updated && epicTimers.has(epicId) && updated.status === "running") {
    scheduleLoopForProject(updated);
  }
  return updated;
}

export async function deleteEpicProject(epicId: string): Promise<boolean> {
  clearEpicTimer(epicId);
  runningIterations.delete(epicId);
  runtimeState.delete(epicId);
  return epicStore.deleteProject(epicId);
}

export async function getEpicProject(epicId: string): Promise<EpicProject | null> {
  return epicStore.getProject(epicId);
}

export async function listEpicProjects(limit?: number): Promise<EpicProject[]> {
  return epicStore.listProjects(limit);
}

export async function listEpicIterations(epicId: string, limit?: number): Promise<EpicIteration[]> {
  return epicStore.listIterations(epicId, limit);
}

export function getEpicRuntimeState(epicId: string): RuntimeState {
  return runtimeState.get(epicId) || {
    running: epicTimers.has(epicId),
    inProgress: runningIterations.has(epicId),
  };
}

export async function resumeEpicLoopsOnBoot(): Promise<void> {
  const projects = await epicStore.listProjects();
  for (const project of projects) {
    if (project.status === "running") {
      scheduleLoopForProject(project);
    }
  }
}
