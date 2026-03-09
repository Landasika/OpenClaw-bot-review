/**
 * 任务调度服务扩展 - 添加 Boss 自动审查功能
 */

import { taskStore } from "./task-store";
import * as FeishuNotifier from "./feishu-notifier";
import { getDefaultAgentId, getSystemConfig } from "./system-config";
import { loadTaskMap } from "./task-dependency";
import { assessTaskReview } from "./task-review";

type ReviewerConfig = {
  enabled: boolean;
  checkInterval: number;
  maxConcurrent: number;
};

function buildReviewerConfig(): ReviewerConfig {
  const cfg = getSystemConfig();
  return {
    enabled: process.env.AUTO_REVIEW_ENABLED !== "false" && cfg.bossReviewEnabled !== false,
    checkInterval: cfg.bossReviewIntervalSeconds * 1000,
    maxConcurrent: cfg.bossReviewMaxConcurrent,
  };
}

// 审查器状态
let reviewerConfig = buildReviewerConfig();
let reviewerInterval: NodeJS.Timeout | null = null;
let isReviewing = false;
let reviewCount = 0;
let lastReviewTime = 0;
let reviewErrorCount = 0;
let lastReviewError: string = "";

/**
 * 启动 Boss 自动审查器
 */
export function startBossReviewer(): void {
  reviewerConfig = buildReviewerConfig();

  if (reviewerInterval) {
    console.log('[BossReviewer] 审查器已在运行');
    return;
  }

  if (!reviewerConfig.enabled) {
    console.log("[BossReviewer] 自动审查已禁用（system-config.json 或 AUTO_REVIEW_ENABLED=false）");
    return;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('👑 [Boss 审查器] 启动自动审查服务');
  console.log('='.repeat(60));
  console.log(`   检查间隔: ${reviewerConfig.checkInterval / 1000} 秒`);
  console.log(`   最大并发: ${reviewerConfig.maxConcurrent} 个任务`);
  console.log('='.repeat(60));
  console.log('');

  // 立即执行一次
  reviewPendingTasks();

  // 定期执行
  reviewerInterval = setInterval(() => {
    reviewPendingTasks();
  }, reviewerConfig.checkInterval);
}

/**
 * 停止 Boss 自动审查器
 */
export function stopBossReviewer(): void {
  if (reviewerInterval) {
    clearInterval(reviewerInterval);
    reviewerInterval = null;
    console.log('');
    console.log('🛑 [Boss 审查器] 自动审查服务已停止');
    console.log(`   总计审查: ${reviewCount} 个任务`);
    console.log(`   错误次数: ${reviewErrorCount}`);
    console.log('');
  }
}

/**
 * 获取审查器状态
 */
export function getBossReviewerStatus(): {
  enabled: boolean;
  running: boolean;
  reviewCount: number;
  lastReviewTime: number;
  errorCount: number;
  lastError: string;
} {
  return {
    enabled: reviewerConfig.enabled,
    running: reviewerInterval !== null,
    reviewCount,
    lastReviewTime,
    errorCount: reviewErrorCount,
    lastError: lastReviewError,
  };
}

/**
 * 审查待审查的任务
 */
async function reviewPendingTasks(): Promise<void> {
  // 防止重复执行
  if (isReviewing) {
    console.log('[BossReviewer] 上一次审查仍在进行，跳过本次检查');
    return;
  }

  isReviewing = true;

  try {
    console.log('');
    console.log('👑'.repeat(30));
    console.log(`📋 [审查检查] ${new Date().toLocaleString('zh-CN')}`);
    console.log('👑'.repeat(30));

    // 1. 获取待审查的任务
    const submittedTasks = await taskStore.listTasks({ status: "submitted" });

    if (submittedTasks.length === 0) {
      console.log('   ✅ 没有待审查的任务');
      console.log('');
      isReviewing = false;
      return;
    }

    console.log(`   📊 找到 ${submittedTasks.length} 个待审查任务`);

    // 2. 限制并发数量
    const tasksToReview = submittedTasks.slice(0, reviewerConfig.maxConcurrent);
    console.log(`   🎯 本次审查 ${tasksToReview.length} 个任务`);
    const taskMap = await loadTaskMap();

    // 3. 逐个审查任务
    let approvedCount = 0;
    let rejectedCount = 0;
    let errorCount = 0;

    for (const task of tasksToReview) {
      console.log('');
      console.log(`   📝 任务 ${task.id}:`);
      console.log(`      标题: ${task.title}`);
      console.log(`      执行人: ${task.assignedTo}`);
      console.log(`      提交结果: ${task.result?.substring(0, 100)}...`);

      try {
        const latestTask = taskMap.get(task.id) || task;
        const reviewResult = assessTaskReview(latestTask, taskMap);
        console.log(
          `      📊 系统审查: ${reviewResult.score}/5, 验收覆盖=${reviewResult.acceptanceCriteria.length - reviewResult.unmetAcceptanceCriteria.length}/${reviewResult.acceptanceCriteria.length || 0}, 依赖=${reviewResult.dependencyCheck.satisfied ? "通过" : "未通过"}`
        );

        // 更新任务状态
        const updatedTask = await taskStore.updateTask(task.id, {
          status: reviewResult.approved ? "approved" : "rejected",
          reviewedBy: getDefaultAgentId(),
          reviewedAt: Date.now(),
          reviewComment: reviewResult.comment,
          reviewScore: reviewResult.score,
        });
        if (updatedTask) {
          taskMap.set(updatedTask.id, updatedTask);
        }

        // 发送通知
        if (reviewResult.approved) {
          await FeishuNotifier.notifyTaskApproved(
            task.id,
            task.title,
            task.assignedTo || "",
            reviewResult.score,
            reviewResult.comment
          );
          console.log(`      ✅ 审查通过 (${reviewResult.score}/5)`);
          approvedCount++;
          reviewCount++;
        } else {
          await FeishuNotifier.notifyTaskRejected(
            task.id,
            task.title,
            task.assignedTo || "",
            reviewResult.score,
            reviewResult.comment
          );
          console.log(`      ❌ 审查驳回 (${reviewResult.score}/5)`);
          rejectedCount++;
          reviewCount++;
        }

        lastReviewTime = Date.now();

      } catch (error: any) {
        console.log(`      ❌ 审查异常: ${error.message}`);
        errorCount++;
        reviewErrorCount++;
        lastReviewError = error.message;
      }
    }

    console.log('');
    console.log('📊'.repeat(30));
    console.log(`📈 [审查统计] 本次检查完成`);
    console.log(`   通过: ${approvedCount} 个`);
    console.log(`   驳回: ${rejectedCount} 个`);
    console.log(`   错误: ${errorCount} 个`);
    console.log(`   总计审查: ${reviewCount} 个`);
    console.log('📊'.repeat(30));
    console.log('');

  } catch (error: any) {
    console.error('[BossReviewer] 审查检查失败:', error.message);
    reviewErrorCount++;
    lastReviewError = error.message;
  } finally {
    isReviewing = false;
  }
}

/**
 * 手动触发审查检查
 */
export async function triggerReviewCheck(): Promise<{
  success: boolean;
  tasksReviewed: number;
  error?: string;
}> {
  try {
    console.log('');
    console.log('🔄 [手动触发] 执行任务审查检查');
    console.log('');

    await reviewPendingTasks();

    return {
      success: true,
      tasksReviewed: reviewCount,
    };
  } catch (error: any) {
    return {
      success: false,
      tasksReviewed: 0,
      error: error.message,
    };
  }
}
