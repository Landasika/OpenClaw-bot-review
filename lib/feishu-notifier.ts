/**
 * 飞书机器人通知模块
 * 在任务状态变化时通过对应的 bot 在群里发送消息
 */

import { execFile } from "child_process";
import { promisify } from "util";
import {
  getAgentDisplayName,
  getDefaultAgentId,
  getSystemConfig,
  resolveFeishuBotScriptPath,
} from "./system-config";

const execFileAsync = promisify(execFile);

type BotType = string;

type FeishuBotCredential = {
  name: string;
  appId: string;
  appSecret: string;
};

function resolveDefaultChatId(override?: string): string {
  if (override && override.trim()) return override.trim();
  return getSystemConfig().feishuDefaultChatId || "";
}

function resolveBotType(agentId?: string): BotType {
  const cfg = getSystemConfig();
  const map = cfg.feishuBotMap || {};
  const defaultAgentId = cfg.defaultAgent;

  if (agentId && map[agentId]) return map[agentId];
  if (map[defaultAgentId]) return map[defaultAgentId];
  return "boss";
}

function hasValidBotCredentials(botCfg: unknown): botCfg is FeishuBotCredential {
  if (!botCfg || typeof botCfg !== "object") return false;
  const cfg = botCfg as Partial<FeishuBotCredential>;
  return !!(cfg.name && cfg.name.trim() && cfg.appId && cfg.appId.trim() && cfg.appSecret && cfg.appSecret.trim());
}

function resolveEmployeeName(agentId: string): string {
  return getAgentDisplayName(agentId);
}

/**
 * 发送飞书消息
 */
async function sendFeishuMessage(
  bot: BotType,
  chatId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const cfg = getSystemConfig();
  if (!cfg.notificationEnabled || !cfg.feishuNotificationEnabled) {
    return { success: true };
  }

  if (!chatId) {
    return { success: false, error: "Missing feishu chat id" };
  }

  const botCfg = (cfg.feishuBots || {})[bot];
  if (!hasValidBotCredentials(botCfg)) {
    return { success: false, error: `feishuBots.${bot} 需要完整配置 name/appId/appSecret` };
  }

  try {
    const scriptPath = resolveFeishuBotScriptPath();
    console.log(`[Feishu] 发送消息: ${bot} -> ${chatId}`);

    const { stdout, stderr } = await execFileAsync(
      "python3",
      [
        scriptPath,
        "--bot",
        bot,
        "--chat",
        chatId,
        "--message",
        message,
      ],
      {
        timeout: 10000,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
        },
      }
    );

    const output = `${stdout || ""}\n${stderr || ""}`.trim();
    if (output.includes("✅ 消息发送成功")) {
      console.log("[Feishu] 消息发送成功");
      return { success: true };
    }

    console.error("[Feishu] 发送失败:", output || "Unknown output");
    return { success: false, error: output || "Unknown output" };
  } catch (error: any) {
    const output = `${error?.stdout || ""}\n${error?.stderr || ""}`.trim();
    if (output.includes("✅ 消息发送成功")) {
      console.log("[Feishu] 消息发送成功");
      return { success: true };
    }
    console.error("[Feishu] 发送消息异常:", output || error.message);
    return { success: false, error: output || error.message };
  }
}

/**
 * 阶段1: Boss分配任务通知
 */
export async function notifyTaskAssigned(
  taskId: string,
  taskTitle: string,
  taskDescription: string,
  assignedTo: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(assignedTo);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【📋 新任务分配】

任务ID: ${taskId}
标题: ${taskTitle}
分配给: ${employeeName}

描述:
${taskDescription}

请 ${employeeName} 查看任务并开始执行。`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 阶段2: 员工领取任务通知
 */
export async function notifyTaskAccepted(
  taskId: string,
  taskTitle: string,
  agentId: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(agentId);
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【👋 任务已领取】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}

状态: 已开始执行
时间: ${new Date().toLocaleString("zh-CN")}`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 阶段3: 员工执行任务完成
 */
export async function notifyTaskCompleted(
  taskId: string,
  taskTitle: string,
  agentId: string,
  result: string,
  duration?: number,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(agentId);
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);
  const durationText = duration ? `${Math.round(duration / 1000 / 60)}分钟` : "未知";

  const message = `【✅ 任务已完成】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}
耗时: ${durationText}

执行结果:
${result.substring(0, 500)}${result.length > 500 ? "..." : ""}

等待Boss审查评估。`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 阶段4: Boss评估任务-通过
 */
export async function notifyTaskApproved(
  taskId: string,
  taskTitle: string,
  agentId: string,
  score: number,
  comment: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);
  const stars = "⭐".repeat(score);

  const message = `【🎉 任务通过审查】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}
评分: ${stars} (${score}/5)

审查意见:
${comment}

恭喜！任务已成功完成！`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 阶段4: Boss评估任务-驳回
 */
export async function notifyTaskRejected(
  taskId: string,
  taskTitle: string,
  agentId: string,
  score: number,
  comment: string,
  improvementTaskId?: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);
  const stars = "⭐".repeat(score);

  let message = `【🔴 任务需改进】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}
评分: ${stars} (${score}/5)

审查意见:
${comment}`;

  if (improvementTaskId) {
    message += `

改进任务ID: ${improvementTaskId}
请根据审查意见完成改进任务。`;
  }

  message += `

时间: ${new Date().toLocaleString("zh-CN")}`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 阶段5: 改进任务创建通知
 */
export async function notifyImprovementTaskCreated(
  originalTaskId: string,
  improvementTaskId: string,
  taskTitle: string,
  agentId: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【🔄 改进任务已创建】

原任务ID: ${originalTaskId}
改进任务ID: ${improvementTaskId}
标题: ${taskTitle}
执行人: ${employeeName}

请根据Boss的审查意见完成改进任务。`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 任务调度开始通知
 */
export async function notifyTaskDispatchStarted(
  taskId: string,
  taskTitle: string,
  agentId: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【🚀 任务调度中】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}

正在通过 openclaw agent 调度执行...`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 任务调度失败通知
 */
export async function notifyTaskDispatchFailed(
  taskId: string,
  taskTitle: string,
  agentId: string,
  error: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【❌ 任务调度失败】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}

错误信息:
${error}

请检查系统状态后重试。`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 任务排队通知（Agent 正在忙，任务进入队列）
 */
export async function notifyTaskQueued(
  taskId: string,
  taskTitle: string,
  agentId: string,
  currentTasks: number = 0,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【⏳ 任务排队中】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}

状态: ${employeeName} 正在执行其他任务
当前任务数: ${currentTasks}

任务已加入队列，等待 ${employeeName} 空闲后自动执行。

预计等待时间: ${currentTasks > 0 ? `${currentTasks * 5}-${currentTasks * 10} 分钟` : "几分钟"}`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * Agent 离线通知
 */
export async function notifyAgentOffline(
  taskId: string,
  taskTitle: string,
  agentId: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【⚠️ Agent 离线提醒】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}

状态: ${employeeName} 当前离线

任务无法调度。请：
1. 检查 ${employeeName} 是否正常运行
2. 等待 Agent 上线后重试
3. 或将任务重新分配给其他员工

时间: ${new Date().toLocaleString("zh-CN")}`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * Agent 空闲通知（任务开始执行）
 */
export async function notifyAgentReady(
  taskId: string,
  taskTitle: string,
  agentId: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【✅ Agent 已就绪】

任务ID: ${taskId}
标题: ${taskTitle}
执行人: ${employeeName}

状态: ${employeeName} 已空闲，开始执行任务

正在通过 openclaw agent 命令调度执行...`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 大项任务进度汇报
 */
export async function notifyEpicProgress(
  epicTitle: string,
  reportMarkdown: string,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const targetChatId = resolveDefaultChatId(chatId);
  const truncated = reportMarkdown.length > 2800
    ? `${reportMarkdown.slice(0, 2800)}\n\n...（已截断）`
    : reportMarkdown;

  const message = `【📈 大项任务进度汇报】

大项: ${epicTitle}
时间: ${new Date().toLocaleString("zh-CN")}

${truncated}`;

  await sendFeishuMessage(bot, targetChatId, message);
}

/**
 * 会话满告警
 */
export async function notifySessionFull(
  agentId: string,
  sessionKey: string,
  sessionType: string,
  usagePercent: number,
  chatId?: string
): Promise<void> {
  const bot = resolveBotType(getDefaultAgentId());
  const employeeName = resolveEmployeeName(agentId);
  const targetChatId = resolveDefaultChatId(chatId);

  const message = `【🚨 会话满告警】

机器人: ${employeeName} (${agentId})
会话类型: ${sessionType}
会话ID: ${sessionKey}
上下文使用率: ${usagePercent.toFixed(1)}%

⚠️ 上下文窗口已使用超过90%，建议删除会话！

时间: ${new Date().toLocaleString("zh-CN")}

请前往会话列表页面删除该会话。`;

  await sendFeishuMessage(bot, targetChatId, message);
}
