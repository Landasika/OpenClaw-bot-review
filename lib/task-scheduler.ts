/**
 * 任务调度器 - 通过 openclaw agent 命令调度员工执行任务
 */

import fs from "fs";
import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import { taskStore } from "./task-store";
import * as FeishuNotifier from "./feishu-notifier";
import { getSystemConfig } from "./system-config";
import { buildTaskMap, evaluateTaskDependencies } from "./task-dependency";
import { normalizeAgentId } from "./agent-id";
import { extractAcceptanceCriteria } from "./task-acceptance";
import { normalizeAutomatedTaskResult } from "./task-result";

const execFileAsync = promisify(execFile);
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const CONTEXT_WINDOW_EXCEEDED_MARKERS = [
  "model_context_window_exceeded",
  "context_window_exceeded",
  "context window exceeded",
];

type AgentCommandResult = {
  responseText: string;
  parsedOutput: any;
  combinedOutput: string;
  contextWindowExceeded: boolean;
  failed: boolean;
  errorMessage?: string;
};

export interface TaskDispatchResult {
  success: boolean;
  taskId: string;
  agentId: string;
  response?: string;
  error?: string;
  duration?: number;
  timestamp: number;
}

function buildTaskExecutionMessage(
  task: {
    title: string;
    description: string;
    acceptanceCriteria?: string;
  },
  taskDescription: string
): string {
  const acceptanceCriteria = extractAcceptanceCriteria(task);
  const checklistTemplate = acceptanceCriteria.map((criterion) => ({
    criterion,
    status: "done",
    evidence: "填写对应证据，例如文件路径、命令输出、截图描述",
  }));

  return [
    "【任务执行】",
    "",
    taskDescription,
    "",
    "请执行此任务，并严格输出 JSON，禁止 Markdown 包裹，字段必须完整：",
    JSON.stringify(
      {
        summary: "2-4 句总结最终交付结果",
        implementation: "说明关键实现步骤、修改点、产物路径或命令",
        verification: "说明验证步骤、执行输出、测试结果或检查方法",
        risks: "说明风险、限制、遗留问题；没有则写“无”并解释边界",
        acceptanceChecklist: checklistTemplate,
      },
      null,
      2
    ),
    "",
    acceptanceCriteria.length > 0
      ? `必须逐条回应这些验收标准：\n${acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : "必须明确给出可验证的验收回执。",
  ].join("\n");
}

function includesContextWindowExceeded(input: string): boolean {
  if (!input) return false;
  const normalized = input.toLowerCase();
  return CONTEXT_WINDOW_EXCEEDED_MARKERS.some((marker) => normalized.includes(marker));
}

function collectResponseTextsFromParsedOutput(parsedOutput: any): string[] {
  const parts: string[] = [];

  if (Array.isArray(parsedOutput?.result?.payloads)) {
    for (const payload of parsedOutput.result.payloads) {
      if (typeof payload?.text === "string" && payload.text.trim() !== "") {
        parts.push(payload.text.trim());
      }
    }
  }

  if (typeof parsedOutput?.summary === "string" && parsedOutput.summary.trim() !== "") {
    parts.push(parsedOutput.summary.trim());
  } else if (parsedOutput?.summary && typeof parsedOutput.summary === "object") {
    parts.push(JSON.stringify(parsedOutput.summary));
  }

  if (typeof parsedOutput?.result === "string" && parsedOutput.result.trim() !== "") {
    parts.push(parsedOutput.result.trim());
  }

  if (typeof parsedOutput?.message === "string" && parsedOutput.message.trim() !== "") {
    parts.push(parsedOutput.message.trim());
  }

  return parts;
}

function parseAgentResponse(combinedOutput: string): { responseText: string; parsedOutput: any } {
  try {
    const parsedOutputs = parseJsonObjectsFromMixedOutput(combinedOutput);
    if (parsedOutputs.length === 0) {
      return { responseText: combinedOutput.trim(), parsedOutput: null };
    }

    const lastParsedOutput = parsedOutputs[parsedOutputs.length - 1];
    const rawParts = parsedOutputs.flatMap((output) => collectResponseTextsFromParsedOutput(output));

    // 去掉空串并去除相邻重复段，避免重复通知内容
    const dedupedParts: string[] = [];
    for (const part of rawParts) {
      const normalized = part.trim();
      if (!normalized) continue;
      if (dedupedParts[dedupedParts.length - 1] === normalized) continue;
      dedupedParts.push(normalized);
    }

    if (dedupedParts.length > 0) {
      return { responseText: dedupedParts.join("\n\n"), parsedOutput: lastParsedOutput };
    }

    return { responseText: combinedOutput.trim(), parsedOutput: lastParsedOutput };
  } catch {
    return { responseText: combinedOutput.trim(), parsedOutput: null };
  }
}

async function runOpenclawAgentCommand(agentId: string, message: string): Promise<AgentCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "openclaw",
      [
        "agent",
        "--agent",
        agentId,
        "--message",
        message,
        "--json"
      ],
      {
        timeout: 600000, // 10分钟超时
        env: {
          ...process.env,
          FORCE_COLOR: "0"
        }
      }
    );

    const combinedOutput = `${stdout}\n${stderr || ""}`;
    const { responseText, parsedOutput } = parseAgentResponse(combinedOutput);
    const parsedJsonText = parsedOutput ? JSON.stringify(parsedOutput) : "";
    const contextWindowExceeded = includesContextWindowExceeded(responseText)
      || includesContextWindowExceeded(combinedOutput)
      || includesContextWindowExceeded(parsedJsonText);

    return {
      responseText,
      parsedOutput,
      combinedOutput,
      contextWindowExceeded,
      failed: false,
    };
  } catch (error: any) {
    const stdout = error?.stdout ? String(error.stdout) : "";
    const stderr = error?.stderr ? String(error.stderr) : "";
    const combinedOutput = `${stdout}\n${stderr}`.trim();
    const fallbackText = combinedOutput || error?.message || String(error);
    const contextWindowExceeded = includesContextWindowExceeded(fallbackText);

    return {
      responseText: fallbackText,
      parsedOutput: null,
      combinedOutput,
      contextWindowExceeded,
      failed: true,
      errorMessage: error?.message || String(error),
    };
  }
}

function resetAgentMainSession(agentId: string): {
  success: boolean;
  removed: boolean;
  sessionId?: string;
  error?: string;
} {
  try {
    const sessionsPath = path.join(OPENCLAW_HOME, "agents", agentId, "sessions", "sessions.json");
    if (!fs.existsSync(sessionsPath)) {
      return { success: false, removed: false, error: `会话索引不存在: ${sessionsPath}` };
    }

    const raw = fs.readFileSync(sessionsPath, "utf-8");
    const sessions = JSON.parse(raw);
    if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) {
      return { success: false, removed: false, error: "sessions.json 格式非法" };
    }

    const mainSessionKey = `agent:${agentId}:main`;
    const existing = sessions[mainSessionKey];
    if (!existing) {
      return { success: true, removed: false };
    }

    delete sessions[mainSessionKey];
    fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));

    return {
      success: true,
      removed: true,
      sessionId: typeof existing.sessionId === "string" ? existing.sessionId : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      removed: false,
      error: error?.message || String(error),
    };
  }
}

/**
 * 调度员工执行任务
 */
export async function dispatchTaskToAgent(
  taskId: string,
  agentId: string,
  taskDescription: string,
  options?: {
    waitForIdle?: boolean;
    maxWait?: number;
    checkInterval?: number;
  }
): Promise<TaskDispatchResult> {
  const startTime = Date.now();
  const normalizedAgentId = normalizeAgentId(agentId) || agentId;
  if (normalizedAgentId !== agentId) {
    console.log(`🔁 [Agent ID 归一化] ${agentId} -> ${normalizedAgentId}`);
    agentId = normalizedAgentId;
  }

  const systemConfig = getSystemConfig();
  const { waitForIdle = true, maxWait = systemConfig.taskDispatchWaitForIdleMaxSeconds * 1000, checkInterval = systemConfig.taskDispatchWaitCheckIntervalSeconds * 1000 } = options || {};

  console.log('');
  console.log('🚀'.repeat(30));
  console.log(`📋 [任务调度] 开始调度任务 ${taskId}`);
  console.log(`   目标 Agent: ${agentId}`);
  console.log(`   等待空闲: ${waitForIdle ? '是' : '否'}`);
  console.log(`   最大等待: ${waitForIdle ? Math.round(maxWait / 60000) + ' 分钟' : 'N/A'}`);
  console.log('🚀'.repeat(30));
  console.log('');

  try {
    // 1. 获取任务详情
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (task.status === "blocked") {
      return {
        success: false,
        taskId,
        agentId,
        error: task.blockedReason || `Task ${taskId} is blocked by dependencies`,
        timestamp: Date.now(),
      };
    }
    if (task.status !== "assigned") {
      return {
        success: false,
        taskId,
        agentId,
        error: `Task ${taskId} status is ${task.status}, cannot dispatch`,
        timestamp: Date.now(),
      };
    }
    if (task.assignedTo !== agentId) {
      return {
        success: false,
        taskId,
        agentId,
        error: `Task ${taskId} is assigned to ${task.assignedTo || "unknown"}, not ${agentId}`,
        timestamp: Date.now(),
      };
    }
    const cancelTask = async (reason: string) => {
      await taskStore.updateTaskIf(
        taskId,
        (current) =>
          current.assignedTo === agentId
          && (current.status === "assigned" || current.status === "in_progress"),
        {
          status: "cancelled",
          result: `执行失败: ${reason}`,
          completedAt: Date.now(),
        }
      );
    };

    console.log(`📝 [任务信息]`);
    console.log(`   标题: ${task.title}`);
    console.log(`   描述: ${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}`);
    console.log('');

    // 2. 检查 Agent 状态
    const status = await getAgentStatus(agentId);

    const stateEmoji = status.state === 'working' ? '🔨' :
                      status.state === 'idle' ? '💤' :
                      status.state === 'offline' ? '💀' : '❓';

    console.log(`🔍 [Agent 状态]`);
    console.log(`   Agent: ${agentId}`);
    console.log(`   状态: ${stateEmoji} ${status.state}`);
    if (status.subagents && status.subagents.length > 0) {
      console.log(`   当前任务: ${status.subagents.length} 个子任务`);
    }
    console.log('');

    if (status.state === 'offline') {
      console.log(`⚠️  [Agent 离线检测] ${agentId} 状态显示离线`);
      console.log(`   🔄 [Ping 测试] 尝试 ping Agent 以确认状态...`);

      // 先 ping Agent，确认是否真的离线
      const pingResult = await pingAgent(agentId);

      if (pingResult.success) {
        console.log(`   ✅ [Ping 成功] Agent 响应正常，重新检查状态...`);

        // 重新获取状态
        const newStatus = await getAgentStatus(agentId);
        const newStateEmoji = newStatus.state === 'working' ? '🔨' :
                             newStatus.state === 'idle' ? '💤' :
                             newStatus.state === 'offline' ? '💀' : '❓';

        console.log(`   🔍 [状态更新] ${newStateEmoji} ${newStatus.state}`);

        // 如果 ping 成功后状态不再是 offline，继续调度
        if (newStatus.state !== 'offline') {
          console.log(`   ✅ [状态恢复] Agent 已恢复在线，继续调度...`);
          console.log('');
          // 更新 status 变量，继续后面的流程
          status.state = newStatus.state;
          status.idle = newStatus.idle;
          status.subagents = newStatus.subagents;
        } else {
          // 仍然是离线，返回失败
          const error = `Agent ${agentId} is offline (ping succeeded but status still offline)`;
          console.log(`   ❌ [确认离线] Agent 状态仍为离线`);
          console.log('');
          await cancelTask(error);

          await FeishuNotifier.notifyAgentOffline(
            taskId,
            task.title,
            agentId
          ).catch(err => console.error("[Feishu] 通知失败:", err));

          return {
            success: false,
            taskId,
            agentId,
            error,
            timestamp: Date.now(),
          };
        }
      } else {
        // ping 失败，确认离线
        const error = `Agent ${agentId} is offline (ping failed: ${pingResult.error})`;
        console.log(`   ❌ [Ping 失败] ${pingResult.error}`);
        console.log(`   ❌ [确认离线] Agent 确实离线`);
        console.log('');
        await cancelTask(error);

        await FeishuNotifier.notifyAgentOffline(
          taskId,
          task.title,
          agentId
        ).catch(err => console.error("[Feishu] 通知失败:", err));

        return {
          success: false,
          taskId,
          agentId,
          error,
          timestamp: Date.now(),
        };
      }
    }

    // 3. 如果 Agent 正在工作，等待其变为空闲
    if (waitForIdle && status.state === 'working') {
      console.log('⏳'.repeat(30));
      console.log(`⏸️  [任务排队] Agent 正在忙，任务进入等待队列`);
      console.log('⏳'.repeat(30));
      console.log('');

      // 通知任务排队
      await FeishuNotifier.notifyTaskQueued(
        taskId,
        task.title,
        agentId,
        status.subagents?.length || 0
      ).catch(err => console.error("[Feishu] 通知失败:", err));

      // 等待空闲
      const becameIdle = await waitForAgentIdle(agentId, maxWait, checkInterval);

      if (!becameIdle) {
        const error = `Agent ${agentId} did not become idle within ${Math.round(maxWait / 60000)} minutes`;

        console.log('❌'.repeat(30));
        console.log(`❌ [调度失败] 等待超时`);
        console.log(`   错误: ${error}`);
        console.log('❌'.repeat(30));
        console.log('');
        await cancelTask(error);

        return {
          success: false,
          taskId,
          agentId,
          error,
          timestamp: Date.now(),
        };
      }
    } else if (status.state === 'idle') {
      console.log('✅'.repeat(30));
      console.log(`✅ [Agent 就绪] ${agentId} 当前空闲，立即调度`);
      console.log('✅'.repeat(30));
      console.log('');
    }

    // 4. 原子抢占任务，避免重复派发
    console.log(`📊 [状态更新] 尝试抢占任务: assigned → in_progress`);
    const claimResult = await taskStore.updateTaskIf(
      taskId,
      (current) => current.status === "assigned" && current.assignedTo === agentId,
      (current) => ({
        status: "in_progress",
        startedAt: current.startedAt || Date.now(),
        blockedReason: undefined,
      })
    );
    if (!claimResult.applied || !claimResult.task) {
      return {
        success: false,
        taskId,
        agentId,
        error: `Task ${taskId} was already claimed or changed (status=${claimResult.current?.status || "missing"})`,
        timestamp: Date.now(),
      };
    }

    // 5. 通知任务开始执行
    await FeishuNotifier.notifyTaskAccepted(
      taskId,
      claimResult.task.title,
      agentId
    ).catch(err => console.error("[Feishu] 通知失败:", err));

    // 6. 构建调度消息
    const message = buildTaskExecutionMessage(task, taskDescription);

    console.log(`🤖 [执行命令] openclaw agent --agent ${agentId}`);
    console.log('');

    // 7. 调用 openclaw agent 命令（遇到上下文超限自动重置会话并重试一次）
    let commandResult = await runOpenclawAgentCommand(agentId, message);

    if (commandResult.contextWindowExceeded) {
      console.log(`⚠️  [上下文超限] ${agentId} 触发 model_context_window_exceeded，准备重置会话并重试一次`);
      const resetResult = resetAgentMainSession(agentId);
      if (resetResult.success) {
        if (resetResult.removed) {
          console.log(`🔄 [会话重置] 已清理主会话: ${resetResult.sessionId || "unknown"}`);
        } else {
          console.log(`ℹ️  [会话重置] 未找到主会话映射，直接重试`);
        }
      } else {
        console.log(`❌ [会话重置失败] ${resetResult.error}`);
        console.log(`ℹ️  [重试继续] 会话重置失败，仍执行一次重试`);
      }
      commandResult = await runOpenclawAgentCommand(agentId, message);
    }

    if (commandResult.failed) {
      throw new Error(commandResult.errorMessage || commandResult.responseText || "openclaw agent command failed");
    }

    if (commandResult.contextWindowExceeded) {
      console.log(`⚠️  [重试后仍超限] ${agentId} 响应仍包含 context window exceeded`);
    }

    // 8. 解析后的最终响应文本
    const responseText = commandResult.responseText;
    const normalizedSubmission = normalizeAutomatedTaskResult(
      task,
      responseText,
      commandResult.parsedOutput
    );

    const duration = Date.now() - startTime;

    // 9. 更新任务状态为"已提交"
    const submitResult = await taskStore.updateTaskIf(
      taskId,
      (current) => current.status === "in_progress" && current.assignedTo === agentId,
      {
        status: "submitted",
        result: normalizedSubmission.result,
        resultDetails: normalizedSubmission.resultDetails,
        completedAt: Date.now(),
      }
    );
    if (!submitResult.applied || !submitResult.task) {
      throw new Error(`任务执行完成后写回失败，当前状态已变为 ${submitResult.current?.status || "missing"}`);
    }

    // 10. 通知任务完成
    FeishuNotifier.notifyTaskCompleted(
      taskId,
      submitResult.task.title || taskId,
      agentId,
      normalizedSubmission.result,
      duration
    ).catch(err => console.error("[Feishu] 通知失败:", err));

    console.log('');
    console.log('🎉'.repeat(30));
    console.log(`✅ [任务完成] ${taskId} 执行完成`);
    console.log(`   耗时: ${Math.round(duration / 1000)} 秒`);
    console.log('🎉'.repeat(30));
    console.log('');

    return {
      success: true,
      taskId,
      agentId,
      response: normalizedSubmission.result,
      duration,
      timestamp: Date.now(),
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMessage = error.message || String(error);

    console.log('');
    console.log('❌'.repeat(30));
    console.log(`❌ [执行失败] ${taskId} 执行失败`);
    console.log(`   错误: ${errorMessage}`);
    console.log(`   耗时: ${Math.round(duration / 1000)} 秒`);
    console.log('❌'.repeat(30));
    console.log('');

    // 更新任务状态，记录错误
    const cancelResult = await taskStore.updateTaskIf(
      taskId,
      (current) =>
        current.assignedTo === agentId
        && (current.status === "assigned" || current.status === "in_progress"),
      {
        status: "cancelled",
        result: `执行失败: ${errorMessage}`,
        completedAt: Date.now(),
      }
    );
    const existingTask = cancelResult.task || cancelResult.current;

    // 通知任务失败
    FeishuNotifier.notifyTaskDispatchFailed(
      taskId,
      existingTask?.title || taskId,
      agentId,
      errorMessage
    ).catch(err => console.error("[Feishu] 通知失败:", err));

    return {
      success: false,
      taskId,
      agentId,
      error: errorMessage,
      duration,
      timestamp: Date.now(),
    };
  }
}

/**
 * 批量调度任务
 */
export async function dispatchMultipleTasks(
  tasks: Array<{ taskId: string; agentId: string; description: string }>
): Promise<TaskDispatchResult[]> {
  const results: TaskDispatchResult[] = [];

  // 串行执行（避免并发过高）
  for (const task of tasks) {
    const result = await dispatchTaskToAgent(
      task.taskId,
      task.agentId,
      task.description
    );
    results.push(result);

    // 间隔1秒，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * 自动调度待执行的任务
 */
export async function autoDispatchPendingTasks(limit = 5): Promise<{
  dispatched: number;
  results: TaskDispatchResult[];
}> {
  console.log(`[TaskScheduler] 自动调度待执行任务，最多 ${limit} 个`);

  // 获取已分配但未开始的任务，并过滤依赖未满足的任务
  const allTasks = await taskStore.listTasks();
  const taskMap = buildTaskMap(allTasks);
  const assignedTasks = allTasks.filter((task) => task.status === "assigned");
  const readyTasks: typeof assignedTasks = [];

  for (const task of assignedTasks) {
    const dependencyCheck = evaluateTaskDependencies(task, taskMap);
    if (dependencyCheck.satisfied) {
      readyTasks.push(task);
      continue;
    }

    await taskStore.updateTask(task.id, {
      status: "blocked",
      blockedReason: dependencyCheck.blockedReason,
    });
    console.log(`[TaskScheduler] 任务 ${task.id} 依赖未满足，已转为 blocked`);
  }

  const tasksToDispatch = readyTasks.slice(0, limit);

  if (tasksToDispatch.length === 0) {
    console.log("[TaskScheduler] 没有待调度的任务");
    return { dispatched: 0, results: [] };
  }

  console.log(`[TaskScheduler] 找到 ${tasksToDispatch.length} 个待调度任务`);

  const results: TaskDispatchResult[] = [];

  for (const task of tasksToDispatch) {
    if (!task.assignedTo) {
      console.log(`[TaskScheduler] 跳过未分配的任务 ${task.id}`);
      continue;
    }

    const result = await dispatchTaskToAgent(
      task.id,
      task.assignedTo,
      `任务: ${task.title}\n\n${task.description}`
    );

    results.push(result);
  }

  return {
    dispatched: results.filter(r => r.success).length,
    results,
  };
}

/**
 * 从混合输出中解析所有 JSON 对象（按出现顺序）
 */
function parseJsonObjectsFromMixedOutput(output: string): any[] {
  const parsedObjects: any[] = [];
  let i = 0;

  while (i < output.length) {
    if (output[i] !== "{") {
      i++;
      continue;
    }

    let parsedOne = false;
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
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") {
              parsedObjects.push(parsed);
              i = j + 1;
              parsedOne = true;
              break;
            }
          } catch {}
          break;
        }
      }
    }

    if (!parsedOne) {
      i++;
    }
  }

  return parsedObjects;
}

/**
 * Ping Agent 以确认是否真的离线
 * @param agentId Agent ID
 * @returns Promise<{ success: boolean; error?: string }>
 */
async function pingAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedAgentId = normalizeAgentId(agentId) || agentId;
    console.log(`   🔄 [执行命令] openclaw agent --agent ${normalizedAgentId} --message "ping" --json`);

    const { stdout, stderr } = await execFileAsync(
      "openclaw",
      ["agent", "--agent", normalizedAgentId, "--message", "ping", "--json"],
      {
        timeout: 30000, // 30秒超时
        env: { ...process.env, FORCE_COLOR: "0" }
      }
    );

    const combinedOutput = `${stdout}\n${stderr || ""}`.toLowerCase();

    // 检查是否包含成功标志
    if (combinedOutput.includes("ok") || combinedOutput.includes("pong") || combinedOutput.includes("success")) {
      console.log(`   ✅ [Ping 响应] Agent 响应正常`);
      return { success: true };
    }

    // 如果输出为空或没有成功标志
    console.log(`   ⚠️  [Ping 响应] 响应异常: ${combinedOutput.substring(0, 200)}`);
    return { success: false, error: "Unexpected ping response" };

  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.log(`   ❌ [Ping 错误] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * 获取Agent状态
 */
async function getAgentStatus(agentId: string): Promise<{ idle: boolean; state: string; subagents?: any[] }> {
  try {
    const normalizedAgentId = normalizeAgentId(agentId) || agentId;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/agent-activity`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const agent = data.agents?.find((a: any) => a.agentId === normalizedAgentId);

    if (!agent) {
      console.error(`[getAgentStatus] Agent ${normalizedAgentId} not found`);
      return { idle: false, state: 'offline' };
    }

    // 只有 idle 状态才算空闲
    // working = 正在执行任务
    // offline = 离线
    const isIdle = agent.state === 'idle';

    return {
      idle: isIdle,
      state: agent.state,
      subagents: agent.subagents
    };
  } catch (error: any) {
    const normalizedAgentId = normalizeAgentId(agentId) || agentId;
    console.error(`[getAgentStatus] Error checking ${normalizedAgentId}:`, error.message);
    return { idle: false, state: 'offline' };
  }
}

/**
 * 检查Agent是否空闲
 */
export async function checkAgentIdle(agentId: string): Promise<{ idle: boolean; state: string; subagents?: any[] }> {
  return getAgentStatus(agentId);
}

/**
 * 检查Agent是否可用（旧方法，保留兼容）
 */
export async function checkAgentAvailable(agentId: string): Promise<boolean> {
  try {
    const normalizedAgentId = normalizeAgentId(agentId) || agentId;
    const { stdout } = await execFileAsync(
      "openclaw",
      ["agent", "--agent", normalizedAgentId, "--message", "ping", "--json"],
      {
        timeout: 30000,
        env: { ...process.env, FORCE_COLOR: "0" }
      }
    );

    return stdout.includes("ok") || stdout.includes("pong");
  } catch {
    return false;
  }
}

/**
 * 等待Agent变为空闲
 * @param agentId Agent ID
 * @param maxWait 最大等待时间（毫秒），默认30分钟
 * @param checkInterval 检查间隔（毫秒），默认30秒
 * @returns Promise<boolean> 是否成功等到空闲
 */
export async function waitForAgentIdle(
  agentId: string,
  maxWait = getSystemConfig().taskDispatchWaitForIdleMaxSeconds * 1000,
  checkInterval = getSystemConfig().taskDispatchWaitCheckIntervalSeconds * 1000
): Promise<boolean> {
  const startTime = Date.now();
  let attempts = 0;
  const maxWaitMinutes = Math.round(maxWait / 60000);
  const checkIntervalSeconds = Math.round(checkInterval / 1000);

  console.log('');
  console.log('='.repeat(60));
  console.log(`⏳ [Agent 等待] 开始等待 ${agentId} 变为空闲`);
  console.log(`   最大等待: ${maxWaitMinutes} 分钟`);
  console.log(`   检查间隔: ${checkIntervalSeconds} 秒`);
  console.log('='.repeat(60));
  console.log('');

  while (Date.now() - startTime < maxWait) {
    attempts++;
    const elapsed = Date.now() - startTime;
    const elapsedMinutes = (elapsed / 60000).toFixed(1);
    const remaining = maxWait - elapsed;
    const remainingMinutes = (remaining / 60000).toFixed(1);

    try {
      const status = await getAgentStatus(agentId);

      // 格式化状态输出
      const stateEmoji = status.state === 'working' ? '🔨' :
                        status.state === 'idle' ? '💤' :
                        status.state === 'offline' ? '💀' : '❓';

      console.log(`🔍 [检查 #${attempts}] ${new Date().toLocaleTimeString('zh-CN')} - 已等待 ${elapsedMinutes} 分钟 (剩余 ${remainingMinutes} 分钟)`);
      console.log(`   Agent: ${agentId}`);
      console.log(`   状态: ${stateEmoji} ${status.state}`);

      // 如果是空闲状态，返回成功
      if (status.idle) {
        console.log('');
        console.log('='.repeat(60));
        console.log(`✅ [Agent 空闲] ${agentId} 已空闲！开始调度任务...`);
        console.log('='.repeat(60));
        console.log('');
        return true;
      }

      // 如果离线，先 ping 确认是否真的离线
      if (status.state === 'offline') {
        console.log(`   ⚠️  [Agent 离线检测] 状态显示离线`);
        console.log(`   🔄 [Ping 测试] 尝试 ping Agent 以确认状态...`);

        const pingResult = await pingAgent(agentId);

        if (pingResult.success) {
          console.log(`   ✅ [Ping 成功] Agent 响应正常，重新检查状态...`);

          // 重新获取状态
          const newStatus = await getAgentStatus(agentId);

          if (newStatus.state === 'offline') {
            console.log(`   ❌ [确认离线] Agent 状态仍为离线，停止等待`);
            console.log('');
            console.log('='.repeat(60));
            console.log(`❌ [等待失败] ${agentId} 已离线`);
            console.log('='.repeat(60));
            console.log('');
            return false;
          }

          if (newStatus.idle) {
            console.log(`   ✅ [状态恢复] Agent 已恢复在线且空闲`);
            console.log('');
            console.log('='.repeat(60));
            console.log(`✅ [Agent 空闲] ${agentId} 已空闲！开始调度任务...`);
            console.log('='.repeat(60));
            console.log('');
            return true;
          }

          console.log(`   ℹ️  [状态恢复] Agent 已在线但仍在忙碌，继续等待...`);
        } else {
          console.log(`   ❌ [Ping 失败] ${pingResult.error}`);
          console.log(`   ❌ [确认离线] Agent 确实离线，停止等待`);
          console.log('');
          console.log('='.repeat(60));
          console.log(`❌ [等待失败] ${agentId} 已离线`);
          console.log('='.repeat(60));
          console.log('');
          return false;
        }
      }

      // 打印当前子任务信息（如果有）
      if (status.subagents && status.subagents.length > 0) {
        console.log(`   当前任务: ${status.subagents.length} 个子任务正在执行`);
        status.subagents.slice(0, 3).forEach((sub: any, idx: number) => {
          const label = sub.label || '未命名任务';
          const truncatedLabel = label.length > 50 ? label.substring(0, 50) + '...' : label;
          console.log(`      ${idx + 1}. ${truncatedLabel}`);
        });
        if (status.subagents.length > 3) {
          console.log(`      ... 还有 ${status.subagents.length - 3} 个任务`);
        }
      }

    } catch (error: any) {
      console.log(`   ❌ 检查失败: ${error.message}`);
    }

    // 计算剩余时间
    if (remaining <= 0) {
      console.log('');
      console.log('='.repeat(60));
      console.log(`⏱️  [等待超时] 已达到最大等待时间 ${maxWaitMinutes} 分钟`);
      console.log('='.repeat(60));
      console.log('');
      break;
    }

    // 等待一段时间再检查（不超过剩余时间）
    const waitTime = Math.min(checkInterval, remaining);
    const waitSeconds = Math.round(waitTime / 1000);
    console.log(`   ⏸️  等待 ${waitSeconds} 秒后再次检查...`);
    console.log('');

    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  console.log('='.repeat(60));
  console.log(`❌ [等待超时] ${agentId} 等待超时（最大等待 ${maxWaitMinutes} 分钟）`);
  console.log('='.repeat(60));
  console.log('');
  return false;
}
