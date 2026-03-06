"use client";

import { useCallback, useEffect, useState } from "react";

interface SchedulerStatus {
  enabled: boolean;
  running: boolean;
  dispatchCount: number;
  lastDispatchTime: number;
  lastDispatchTimeFormatted: string;
  errorCount: number;
  lastError: string;
}

interface ReviewerStatus {
  enabled: boolean;
  running: boolean;
  reviewCount: number;
  lastReviewTime: number;
  lastReviewTimeFormatted: string;
  errorCount: number;
  lastError: string;
}

interface MeetingStatus {
  enabled: boolean;
  running: boolean;
  isMeetingRunning: boolean;
  meetingCount: number;
  lastMeetingTime: number;
  lastMeetingTimeFormatted: string;
  errorCount: number;
  lastError: string;
}

interface SchedulerSettings {
  taskDispatchEnabled: boolean;
  taskDispatchIntervalSeconds: number;
  taskDispatchMaxConcurrent: number;
  bossReviewEnabled: boolean;
  bossReviewIntervalSeconds: number;
  bossReviewMaxConcurrent: number;
  meetingEnabled: boolean;
  meetingDailyTime: string;
  meetingTimezone: string;
}

interface TaskSchedulerControlProps {
  className?: string;
}

export function TaskSchedulerControl({ className = "" }: TaskSchedulerControlProps) {
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [reviewerStatus, setReviewerStatus] = useState<ReviewerStatus | null>(null);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus | null>(null);
  const [settings, setSettings] = useState<SchedulerSettings | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/task-scheduler", { cache: "no-store" });
      const data = await res.json();
      setSchedulerStatus(data.scheduler);
      setReviewerStatus(data.reviewer);
      setMeetingStatus(data.meeting || null);
      setSettings(data.settings || null);
    } catch (error) {
      console.error("获取状态失败:", error);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleAction = async (action: string, service: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/task-scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, service }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchStatus();
      } else {
        alert(`操作失败: ${data.error}`);
      }
    } catch (error: any) {
      alert(`操作失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!schedulerStatus || !reviewerStatus || !meetingStatus) {
    return (
      <div className={`p-4 bg-white rounded-lg shadow ${className}`}>
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-white rounded-lg shadow ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">🤖 自动化服务</h2>
      </div>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-blue-900">📋 任务调度器</h3>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${schedulerStatus.running ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            <span className="text-sm text-gray-600">
              {schedulerStatus.running ? "运行中" : "已停止"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
          <div>
            <span className="text-gray-600">已调度:</span>
            <span className="ml-2 font-medium">{schedulerStatus.dispatchCount} 个</span>
          </div>
          <div>
            <span className="text-gray-600">最后调度:</span>
            <span className="ml-2 text-xs">{schedulerStatus.lastDispatchTimeFormatted}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {!schedulerStatus.running ? (
            <button
              onClick={() => handleAction("start", "scheduler")}
              disabled={loading}
              className="flex-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50"
            >
              {loading ? "启动中..." : "▶️ 启动"}
            </button>
          ) : (
            <>
              <button
                onClick={() => handleAction("stop", "scheduler")}
                disabled={loading}
                className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {loading ? "停止中..." : "⏸️ 停止"}
              </button>
              <button
                onClick={() => handleAction("trigger", "scheduler")}
                disabled={loading}
                className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {loading ? "检查中..." : "🔄 立即检查"}
              </button>
            </>
          )}
          <button
            onClick={() => handleAction("restart", "scheduler")}
            disabled={loading}
            className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {loading ? "重启中..." : "🔄 重启"}
          </button>
        </div>
      </div>

      <div className="mb-6 p-4 bg-purple-50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-purple-900">👑 Boss 审查器</h3>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${reviewerStatus.running ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            <span className="text-sm text-gray-600">
              {reviewerStatus.running ? "运行中" : "已停止"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
          <div>
            <span className="text-gray-600">已审查:</span>
            <span className="ml-2 font-medium">{reviewerStatus.reviewCount} 个</span>
          </div>
          <div>
            <span className="text-gray-600">最后审查:</span>
            <span className="ml-2 text-xs">{reviewerStatus.lastReviewTimeFormatted}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {!reviewerStatus.running ? (
            <button
              onClick={() => handleAction("start", "reviewer")}
              disabled={loading}
              className="flex-1 px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm disabled:opacity-50"
            >
              {loading ? "启动中..." : "▶️ 启动"}
            </button>
          ) : (
            <>
              <button
                onClick={() => handleAction("stop", "reviewer")}
                disabled={loading}
                className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {loading ? "停止中..." : "⏸️ 停止"}
              </button>
              <button
                onClick={() => handleAction("trigger", "reviewer")}
                disabled={loading}
                className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {loading ? "检查中..." : "🔄 立即检查"}
              </button>
            </>
          )}
          <button
            onClick={() => handleAction("restart", "reviewer")}
            disabled={loading}
            className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {loading ? "重启中..." : "🔄 重启"}
          </button>
        </div>
      </div>

      <div className="mb-4 p-4 bg-amber-50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-amber-900">🗓️ 团队会议服务</h3>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${meetingStatus.running ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            <span className="text-sm text-gray-600">
              {meetingStatus.running ? "运行中" : "已停止"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
          <div>
            <span className="text-gray-600">已开会:</span>
            <span className="ml-2 font-medium">{meetingStatus.meetingCount} 次</span>
          </div>
          <div>
            <span className="text-gray-600">最后会议:</span>
            <span className="ml-2 text-xs">{meetingStatus.lastMeetingTimeFormatted}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {!meetingStatus.running ? (
            <button
              onClick={() => handleAction("start", "meeting")}
              disabled={loading}
              className="flex-1 px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 text-sm disabled:opacity-50"
            >
              {loading ? "启动中..." : "▶️ 启动"}
            </button>
          ) : (
            <>
              <button
                onClick={() => handleAction("stop", "meeting")}
                disabled={loading}
                className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {loading ? "停止中..." : "⏸️ 停止"}
              </button>
              <button
                onClick={() => handleAction("trigger", "meeting")}
                disabled={loading}
                className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {loading ? "执行中..." : "🗣️ 立即开会"}
              </button>
            </>
          )}
          <button
            onClick={() => handleAction("restart", "meeting")}
            disabled={loading}
            className="flex-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {loading ? "重启中..." : "🔄 重启"}
          </button>
        </div>
      </div>

      {settings && (
        <div className="text-xs text-gray-500 space-y-1">
          <p>
            💡 <strong>任务调度器</strong>: {settings.taskDispatchEnabled
              ? `每 ${settings.taskDispatchIntervalSeconds} 秒自动检查待调度任务，最多同时调度 ${settings.taskDispatchMaxConcurrent} 个`
              : "已禁用自动调度"}
          </p>
          <p>
            👑 <strong>Boss 审查器</strong>: {settings.bossReviewEnabled
              ? `每 ${settings.bossReviewIntervalSeconds} 秒自动检查待审查任务，最多同时审查 ${settings.bossReviewMaxConcurrent} 个`
              : "已禁用自动审查"}
          </p>
          <p>
            🗓️ <strong>会议服务</strong>: {settings.meetingEnabled
              ? `每天 ${settings.meetingDailyTime} (${settings.meetingTimezone}) 自动召开`
              : "已禁用自动会议"}
          </p>
        </div>
      )}

      {(schedulerStatus.lastError || reviewerStatus.lastError || meetingStatus.lastError) && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <strong>最后错误:</strong> {schedulerStatus.lastError || reviewerStatus.lastError || meetingStatus.lastError}
        </div>
      )}
    </div>
  );
}
