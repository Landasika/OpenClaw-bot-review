/**
 * 任务调度服务 - 定期自动调度待执行的任务
 *
 * 功能：
 * - 定期检查 assigned 状态的任务
 * - 自动调用 dispatch API
 * - 检查 Agent 状态并等待空闲
 */

import { taskStore } from "./task-store";
import {
  dispatchTaskToAgent,
} from "./task-scheduler";
import { getSystemConfig } from "./system-config";
import { buildTaskMap, evaluateTaskDependencies } from "./task-dependency";

type SchedulerConfig = {
  enabled: boolean;
  checkInterval: number;
  maxConcurrent: number;
  maxRetries: number;
  retryDelay: number;
  dispatchWaitMaxMs: number;
  dispatchCheckIntervalMs: number;
};

function buildSchedulerConfig(): SchedulerConfig {
  const cfg = getSystemConfig();
  return {
    enabled: process.env.AUTO_DISPATCH_ENABLED !== "false" && cfg.taskDispatchEnabled !== false,
    checkInterval: cfg.taskDispatchIntervalSeconds * 1000,
    maxConcurrent: cfg.taskDispatchMaxConcurrent,
    maxRetries: cfg.taskDispatchMaxRetries,
    retryDelay: cfg.taskDispatchRetryDelaySeconds * 1000,
    dispatchWaitMaxMs: cfg.taskDispatchWaitForIdleMaxSeconds * 1000,
    dispatchCheckIntervalMs: cfg.taskDispatchWaitCheckIntervalSeconds * 1000,
  };
}

// 调度器状态
let schedulerConfig = buildSchedulerConfig();
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let dispatchCount = 0;
let lastDispatchTime = 0;
let errorCount = 0;
let lastError: string = "";

/**
 * 启动自动调度器
 */
export function startTaskScheduler(): void {
  schedulerConfig = buildSchedulerConfig();

  if (schedulerInterval) {
    console.log('[TaskScheduler] 调度器已在运行');
    return;
  }

  if (!schedulerConfig.enabled) {
    console.log("[TaskScheduler] 自动调度已禁用（system-config.json 或 AUTO_DISPATCH_ENABLED=false）");
    return;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('🔄 [任务调度器] 启动自动调度服务');
  console.log('='.repeat(60));
  console.log(`   检查间隔: ${schedulerConfig.checkInterval / 1000} 秒`);
  console.log(`   最大并发: ${schedulerConfig.maxConcurrent} 个任务`);
  console.log(`   最大重试: ${schedulerConfig.maxRetries} 次`);
  console.log('='.repeat(60));
  console.log('');

  // 立即执行一次
  schedulePendingTasks();

  // 定期执行
  schedulerInterval = setInterval(() => {
    schedulePendingTasks();
  }, schedulerConfig.checkInterval);
}

/**
 * 停止自动调度器
 */
export function stopTaskScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('');
    console.log('🛑 [任务调度器] 自动调度服务已停止');
    console.log(`   总计调度: ${dispatchCount} 个任务`);
    console.log(`   错误次数: ${errorCount}`);
    console.log('');
  }
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus(): {
  enabled: boolean;
  running: boolean;
  dispatchCount: number;
  lastDispatchTime: number;
  errorCount: number;
  lastError: string;
} {
  return {
    enabled: schedulerConfig.enabled,
    running: schedulerInterval !== null,
    dispatchCount,
    lastDispatchTime,
    errorCount,
    lastError,
  };
}

/**
 * 调度待执行的任务
 */
export async function schedulePendingTasks(): Promise<void> {
  // 防止重复执行
  if (isRunning) {
    console.log('[TaskScheduler] 上一次调度仍在进行，跳过本次检查');
    return;
  }

  isRunning = true;

  try {
    console.log('');
    console.log('🔍'.repeat(30));
    console.log(`📋 [调度检查] ${new Date().toLocaleString('zh-CN')}`);
    console.log('🔍'.repeat(30));

    // 1. 扫描 blocked 任务并自动解锁可执行任务
    const allTasks = await taskStore.listTasks();
    const taskMap = buildTaskMap(allTasks);
    const blockedTasks = allTasks.filter((task) => task.status === "blocked");
    let unblockedCount = 0;

    for (const task of blockedTasks) {
      if (!task.assignedTo) {
        await taskStore.updateTask(task.id, {
          status: "pending",
          blockedReason: undefined,
        });
        continue;
      }

      const dependencyCheck = evaluateTaskDependencies(task, taskMap);
      if (dependencyCheck.satisfied) {
        await taskStore.updateTask(task.id, {
          status: "assigned",
          blockedReason: undefined,
        });
        unblockedCount++;
      } else if (task.blockedReason !== dependencyCheck.blockedReason) {
        await taskStore.updateTask(task.id, {
          blockedReason: dependencyCheck.blockedReason,
        });
      }
    }

    // 2. 获取最新 assigned 任务并再次校验依赖，避免越权调度
    const latestTasks = await taskStore.listTasks();
    const latestTaskMap = buildTaskMap(latestTasks);
    const assignedTasks = latestTasks.filter((task) => task.status === "assigned");
    const readyTasks: typeof assignedTasks = [];
    let dependencySkipCount = 0;

    for (const task of assignedTasks) {
      const dependencyCheck = evaluateTaskDependencies(task, latestTaskMap);
      if (dependencyCheck.satisfied) {
        readyTasks.push(task);
        continue;
      }

      await taskStore.updateTask(task.id, {
        status: "blocked",
        blockedReason: dependencyCheck.blockedReason,
      });
      dependencySkipCount++;
    }

    if (readyTasks.length === 0) {
      console.log('   ✅ 没有可调度任务');
      console.log(`   ⛔ blocked: ${blockedTasks.length}`);
      console.log(`   🔓 本轮解锁: ${unblockedCount}`);
      if (dependencySkipCount > 0) {
        console.log(`   ⏭️  依赖阻塞跳过: ${dependencySkipCount}`);
      }
      console.log('');
      isRunning = false;
      return;
    }

    console.log(`   📊 可调度任务: ${readyTasks.length} 个`);
    console.log(`   ⛔ blocked 任务: ${blockedTasks.length} 个`);
    console.log(`   🔓 本轮自动解锁: ${unblockedCount} 个`);
    if (dependencySkipCount > 0) {
      console.log(`   ⏭️  依赖阻塞跳过: ${dependencySkipCount} 个`);
    }

    // 3. 限制并发数量
    const tasksToDispatch = readyTasks.slice(0, schedulerConfig.maxConcurrent);
    console.log(`   🎯 本次调度 ${tasksToDispatch.length} 个任务`);

    // 4. 逐个调度任务
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const task of tasksToDispatch) {
      if (!task.assignedTo) {
        console.log(`   ⏭️  跳过未分配的任务: ${task.id}`);
        skipCount++;
        continue;
      }

      console.log('');
      console.log(`   📝 任务 ${task.id}:`);
      console.log(`      标题: ${task.title}`);
      console.log(`      分配给: ${task.assignedTo}`);

      // 直接调度，让 dispatchTaskToAgent 自己处理 Agent 状态检查（包括 ping 逻辑）
      try {
        console.log(`      🔄 开始调度任务...`);

        const result = await dispatchTaskToAgent(
          task.id,
          task.assignedTo,
          `任务: ${task.title}\n\n${task.description}`,
          {
            waitForIdle: true,
            maxWait: schedulerConfig.dispatchWaitMaxMs,
            checkInterval: schedulerConfig.dispatchCheckIntervalMs,
          }
        );

        if (result.success) {
          console.log(`      ✅ 调度成功，耗时: ${result.duration ? Math.round(result.duration / 1000) + '秒' : 'N/A'}`);
          successCount++;
          dispatchCount++;
          lastDispatchTime = Date.now();
        } else {
          console.log(`      ❌ 调度失败: ${result.error}`);
          failCount++;
          errorCount++;
          lastError = result.error || "Unknown error";
        }

      } catch (error: any) {
        console.log(`      ❌ 调度异常: ${error.message}`);
        failCount++;
        errorCount++;
        lastError = error.message;
      }
    }

    console.log('');
    console.log('📊'.repeat(30));
    console.log(`📈 [调度统计] 本次检查完成`);
    console.log(`   成功: ${successCount} 个`);
    console.log(`   跳过: ${skipCount} 个`);
    console.log(`   依赖阻塞: ${dependencySkipCount} 个`);
    console.log(`   失败: ${failCount} 个`);
    console.log(`   自动解锁: ${unblockedCount} 个`);
    console.log(`   总计调度: ${dispatchCount} 个`);
    console.log('📊'.repeat(30));
    console.log('');

  } catch (error: any) {
    console.error('[TaskScheduler] 调度检查失败:', error.message);
    errorCount++;
    lastError = error.message;
  } finally {
    isRunning = false;
  }
}

/**
 * 手动触发调度检查
 */
export async function triggerScheduleCheck(): Promise<{
  success: boolean;
  tasksDispatched: number;
  error?: string;
}> {
  try {
    console.log('');
    console.log('🔄 [手动触发] 执行任务调度检查');
    console.log('');

    await schedulePendingTasks();

    return {
      success: true,
      tasksDispatched: dispatchCount,
    };
  } catch (error: any) {
    return {
      success: false,
      tasksDispatched: 0,
      error: error.message,
    };
  }
}
