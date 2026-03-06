"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TaskSchedulerControl } from "../task-scheduler-control";
import { useI18n } from "@/lib/i18n";

type ConfigData = Record<string, any>;
type RuntimeService = "scheduler" | "reviewer" | "meeting";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toIntInput(value: string, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.round(n);
}

export default function SystemConfigPage() {
  const { t } = useI18n();
  const [savedConfig, setSavedConfig] = useState<ConfigData | null>(null);
  const [draftConfig, setDraftConfig] = useState<ConfigData | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/system-config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "读取 system-config 失败");
      }
      setSavedConfig(data);
      setDraftConfig(data);
      setJsonText(formatJson(data));
      setJsonError(null);
      setDirty(false);
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.message || "读取 system-config 失败",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const availableAgents = useMemo(() => {
    if (!draftConfig || !Array.isArray(draftConfig.availableAgents)) {
      return [];
    }
    return draftConfig.availableAgents.filter((agent: unknown) => typeof agent === "string");
  }, [draftConfig]);

  const applyDraft = (next: ConfigData, markDirty = true) => {
    setDraftConfig(next);
    setJsonText(formatJson(next));
    setJsonError(null);
    if (markDirty) {
      setDirty(true);
    }
    setMessage(null);
  };

  const updateField = (key: string, value: unknown) => {
    if (!draftConfig) {
      return;
    }
    applyDraft({
      ...draftConfig,
      [key]: value,
    });
  };

  const onJsonChange = (text: string) => {
    setJsonText(text);
    setDirty(true);
    setMessage(null);

    try {
      const parsed = JSON.parse(text);
      if (!isRecord(parsed)) {
        throw new Error("JSON 顶层必须是对象");
      }
      setDraftConfig(parsed as ConfigData);
      setJsonError(null);
    } catch (error: any) {
      setJsonError(error.message || "JSON 格式错误");
    }
  };

  const resetDraft = () => {
    if (!savedConfig) {
      return;
    }
    setDraftConfig(savedConfig);
    setJsonText(formatJson(savedConfig));
    setJsonError(null);
    setDirty(false);
    setMessage(null);
  };

  const saveConfig = async () => {
    if (!draftConfig) {
      return;
    }
    if (jsonError) {
      setMessage({
        type: "error",
        text: "JSON 有错误，请先修正后再保存",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const saveRes = await fetch("/api/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", config: draftConfig }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || "保存配置失败");
      }

      const nextConfig = saveData.config as ConfigData;
      setSavedConfig(nextConfig);
      setDraftConfig(nextConfig);
      setJsonText(formatJson(nextConfig));
      setJsonError(null);
      setDirty(false);

      if (saveData.needsRuntimeReload && Array.isArray(saveData.reloadCandidates) && saveData.reloadCandidates.length > 0) {
        const services = saveData.reloadCandidates as RuntimeService[];
        const names = services
          .map((svc) => {
            if (svc === "scheduler") return "任务调度器";
            if (svc === "reviewer") return "Boss 审查器";
            return "会议服务";
          })
          .join("、");
        const confirmed = window.confirm(`配置已保存。检测到运行中服务参数变化：${names}。\n是否立即重载这些服务使配置生效？`);

        if (confirmed) {
          const reloadRes = await fetch("/api/system-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reload", services }),
          });
          const reloadData = await reloadRes.json();
          if (!reloadRes.ok || !reloadData.success) {
            throw new Error(reloadData.error || "服务重载失败");
          }
          setMessage({
            type: "success",
            text: `配置已保存，并已重载：${names}`,
          });
          return;
        }

        setMessage({
          type: "success",
          text: "配置已保存，未执行服务重载（可稍后手动重启服务）",
        });
        return;
      }

      setMessage({
        type: "success",
        text: "配置已保存",
      });
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.message || "保存配置失败",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draftConfig) {
    return (
      <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
        <div className="text-[var(--text-muted)] text-sm">{t("common.loading")}</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚙️ 系统配置</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">统一管理 system-config，并支持运行中服务按需重载</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm font-medium hover:border-[var(--accent)] transition"
          >
            {t("common.backOverview")}
          </Link>
        </div>
      </div>

      <TaskSchedulerControl className="mb-6" />

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 mb-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">基础配置</h2>
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800">有未保存修改</span>}
            <button
              onClick={resetDraft}
              disabled={saving || !dirty}
              className="px-3 py-1.5 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
            >
              重置
            </button>
            <button
              onClick={saveConfig}
              disabled={saving || !dirty}
              className="px-3 py-1.5 rounded bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存配置"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">日志级别</span>
            <select
              value={String(draftConfig.logLevel ?? "info")}
              onChange={(e) => updateField("logLevel", e.target.value)}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            >
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">默认 Agent</span>
            <select
              value={String(draftConfig.defaultAgent ?? "")}
              onChange={(e) => updateField("defaultAgent", e.target.value)}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            >
              {availableAgents.map((agentId) => (
                <option key={agentId} value={agentId}>{agentId}</option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">Gateway 默认端口</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={Number(draftConfig.gatewayDefaultPort ?? 18789)}
              onChange={(e) => updateField("gatewayDefaultPort", toIntInput(e.target.value, Number(draftConfig.gatewayDefaultPort ?? 18789)))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(draftConfig.notificationEnabled)}
              onChange={(e) => updateField("notificationEnabled", e.target.checked)}
              className="h-4 w-4"
            />
            启用通知
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(draftConfig.feishuNotificationEnabled)}
              onChange={(e) => updateField("feishuNotificationEnabled", e.target.checked)}
              className="h-4 w-4"
            />
            启用飞书通知
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">默认告警检查间隔（分钟）</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={Number(draftConfig.alertsDefaultCheckIntervalMinutes ?? 10)}
              onChange={(e) => updateField("alertsDefaultCheckIntervalMinutes", toIntInput(e.target.value, Number(draftConfig.alertsDefaultCheckIntervalMinutes ?? 10)))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">飞书默认 Chat ID</span>
            <input
              type="text"
              value={String(draftConfig.feishuDefaultChatId ?? "")}
              onChange={(e) => updateField("feishuDefaultChatId", e.target.value)}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
            <h3 className="font-medium text-blue-900">📋 任务调度器参数</h3>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(draftConfig.taskDispatchEnabled)}
                onChange={(e) => updateField("taskDispatchEnabled", e.target.checked)}
                className="h-4 w-4"
              />
              启用自动调度
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-600">检查间隔(秒)
                <input
                  type="number"
                  min={5}
                  max={86400}
                  value={Number(draftConfig.taskDispatchIntervalSeconds ?? 60)}
                  onChange={(e) => updateField("taskDispatchIntervalSeconds", toIntInput(e.target.value, Number(draftConfig.taskDispatchIntervalSeconds ?? 60)))}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 bg-white"
                />
              </label>
              <label className="text-xs text-gray-600">最大并发
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Number(draftConfig.taskDispatchMaxConcurrent ?? 3)}
                  onChange={(e) => updateField("taskDispatchMaxConcurrent", toIntInput(e.target.value, Number(draftConfig.taskDispatchMaxConcurrent ?? 3)))}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 bg-white"
                />
              </label>
              <label className="text-xs text-gray-600">最大重试次数
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Number(draftConfig.taskDispatchMaxRetries ?? 3)}
                  onChange={(e) => updateField("taskDispatchMaxRetries", toIntInput(e.target.value, Number(draftConfig.taskDispatchMaxRetries ?? 3)))}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 bg-white"
                />
              </label>
              <label className="text-xs text-gray-600">重试延迟(秒)
                <input
                  type="number"
                  min={1}
                  max={86400}
                  value={Number(draftConfig.taskDispatchRetryDelaySeconds ?? 300)}
                  onChange={(e) => updateField("taskDispatchRetryDelaySeconds", toIntInput(e.target.value, Number(draftConfig.taskDispatchRetryDelaySeconds ?? 300)))}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 bg-white"
                />
              </label>
              <label className="text-xs text-gray-600">等待空闲最大时长(秒)
                <input
                  type="number"
                  min={0}
                  max={86400}
                  value={Number(draftConfig.taskDispatchWaitForIdleMaxSeconds ?? 600)}
                  onChange={(e) => updateField("taskDispatchWaitForIdleMaxSeconds", toIntInput(e.target.value, Number(draftConfig.taskDispatchWaitForIdleMaxSeconds ?? 600)))}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 bg-white"
                />
              </label>
              <label className="text-xs text-gray-600">等待检查间隔(秒)
                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={Number(draftConfig.taskDispatchWaitCheckIntervalSeconds ?? 30)}
                  onChange={(e) => updateField("taskDispatchWaitCheckIntervalSeconds", toIntInput(e.target.value, Number(draftConfig.taskDispatchWaitCheckIntervalSeconds ?? 30)))}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 bg-white"
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
            <h3 className="font-medium text-purple-900">👑 Boss 审查器参数</h3>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(draftConfig.bossReviewEnabled)}
                onChange={(e) => updateField("bossReviewEnabled", e.target.checked)}
                className="h-4 w-4"
              />
              启用自动审查
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-600">检查间隔(秒)
                <input
                  type="number"
                  min={5}
                  max={86400}
                  value={Number(draftConfig.bossReviewIntervalSeconds ?? 30)}
                  onChange={(e) => updateField("bossReviewIntervalSeconds", toIntInput(e.target.value, Number(draftConfig.bossReviewIntervalSeconds ?? 30)))}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 bg-white"
                />
              </label>
              <label className="text-xs text-gray-600">最大并发
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Number(draftConfig.bossReviewMaxConcurrent ?? 2)}
                  onChange={(e) => updateField("bossReviewMaxConcurrent", toIntInput(e.target.value, Number(draftConfig.bossReviewMaxConcurrent ?? 2)))}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-gray-300 bg-white"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">Session 回溯天数</span>
            <input
              type="number"
              min={1}
              max={365}
              value={Number(draftConfig.agentActivitySessionLookbackDays ?? 7)}
              onChange={(e) => updateField("agentActivitySessionLookbackDays", toIntInput(e.target.value, Number(draftConfig.agentActivitySessionLookbackDays ?? 7)))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">最大父会话解析数</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={Number(draftConfig.agentActivityMaxParentSessionsToParse ?? 40)}
              onChange={(e) => updateField("agentActivityMaxParentSessionsToParse", toIntInput(e.target.value, Number(draftConfig.agentActivityMaxParentSessionsToParse ?? 40)))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">孤儿会话补偿窗口(分钟)</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={Number(draftConfig.agentActivityOrphanFallbackWindowMinutes ?? 15)}
              onChange={(e) => updateField("agentActivityOrphanFallbackWindowMinutes", toIntInput(e.target.value, Number(draftConfig.agentActivityOrphanFallbackWindowMinutes ?? 15)))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">子 Agent 最大活跃(分钟)</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={Number(draftConfig.agentActivitySubagentMaxActiveMinutes ?? 30)}
              onChange={(e) => updateField("agentActivitySubagentMaxActiveMinutes", toIntInput(e.target.value, Number(draftConfig.agentActivitySubagentMaxActiveMinutes ?? 30)))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
        </div>

        <label className="text-sm space-y-1 block">
          <span className="text-[var(--text-muted)]">飞书机器人脚本路径</span>
          <input
            type="text"
            value={String(draftConfig.feishuBotScriptPath ?? "")}
            onChange={(e) => updateField("feishuBotScriptPath", e.target.value)}
            className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
          />
        </label>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">高级 JSON</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          此区域可编辑完整 system-config。保存时会进行字段和类型校验。
        </p>
        <textarea
          value={jsonText}
          onChange={(e) => onJsonChange(e.target.value)}
          className="w-full min-h-[360px] rounded border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs leading-5"
          spellCheck={false}
        />
        {jsonError && (
          <div className="mt-2 text-xs text-red-500">JSON 错误: {jsonError}</div>
        )}
      </section>

      {message && (
        <div className={`text-sm ${message.type === "success" ? "text-green-500" : "text-red-500"}`}>
          {message.text}
        </div>
      )}
    </main>
  );
}
