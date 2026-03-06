/**
 * 应用初始化 - 启动任务调度和Boss审查服务
 *
 * 通过显式调用执行，避免在构建阶段触发
 */

import { startTaskScheduler } from "@/lib/task-scheduler-service";
import { startBossReviewer } from "@/lib/task-scheduler-extended";
import { getSystemConfig } from "@/lib/system-config";

declare global {
  var __OPENCLAW_TASK_AUTOMATION_INITIALIZED__: boolean | undefined;
}

function isBuildPhase(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return true;
  }

  if (process.env.npm_lifecycle_event === "build") {
    return true;
  }

  return process.argv.some((arg) => arg.includes("next") || arg === "build")
    && process.argv.includes("build");
}

export function initTaskAutomation(): void {
  if (typeof window !== "undefined") {
    return;
  }

  if (isBuildPhase()) {
    return;
  }

  if (globalThis.__OPENCLAW_TASK_AUTOMATION_INITIALIZED__) {
    return;
  }

  globalThis.__OPENCLAW_TASK_AUTOMATION_INITIALIZED__ = true;
  const cfg = getSystemConfig();

  console.log("");
  console.log("=".repeat(60));
  console.log("🚀 [应用初始化] 启动任务调度和审查服务");
  console.log("=".repeat(60));

  // 启动任务调度器（调度员工Agent执行任务）
  startTaskScheduler();

  // 启动Boss审查器（自动审查提交的任务）
  startBossReviewer();

  console.log("=".repeat(60));
  console.log("✅ [应用初始化] 服务已启动");
  console.log(`   📋 任务调度器: 每 ${cfg.taskDispatchIntervalSeconds} 秒检查待调度任务`);
  console.log(`   👑 Boss 审查器: 每 ${cfg.bossReviewIntervalSeconds} 秒检查待审查任务`);
  console.log("=".repeat(60));
  console.log("");
}
