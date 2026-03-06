"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MeetingPromptFiles, MeetingPromptTextMap } from "@/lib/meeting-types";
import type { TaskStatus } from "@/lib/task-types";

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "pending", label: "pending（待分配）" },
  { value: "assigned", label: "assigned（已分配）" },
  { value: "blocked", label: "blocked（阻塞）" },
  { value: "in_progress", label: "in_progress（进行中）" },
  { value: "submitted", label: "submitted（待审查）" },
  { value: "approved", label: "approved（已通过）" },
  { value: "rejected", label: "rejected（驳回）" },
  { value: "cancelled", label: "cancelled（取消）" },
];

interface SettingsPayload {
  meetingEnabled: boolean;
  meetingDailyTime: string;
  meetingTimezone: string;
  meetingParticipants: string[];
  meetingDiscussionStatuses: TaskStatus[];
  meetingPromptFiles: MeetingPromptFiles;
}

export default function MeetingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [defaultAgent, setDefaultAgent] = useState("");

  const [settings, setSettings] = useState<SettingsPayload>({
    meetingEnabled: false,
    meetingDailyTime: "09:30",
    meetingTimezone: "Asia/Shanghai",
    meetingParticipants: [],
    meetingDiscussionStatuses: ["pending", "assigned", "blocked", "in_progress", "rejected"],
    meetingPromptFiles: {
      kickoff: "meeting-kickoff.md",
      employee: "meeting-employee.md",
      summary: "meeting-summary.md",
    },
  });

  const [prompts, setPrompts] = useState<MeetingPromptTextMap>({
    kickoff: "",
    employee: "",
    summary: "",
  });

  const employeeCandidates = useMemo(
    () => availableAgents.filter((agentId) => agentId !== defaultAgent),
    [availableAgents, defaultAgent]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [settingsRes, promptsRes] = await Promise.all([
        fetch("/api/meetings/settings", { cache: "no-store" }),
        fetch("/api/meetings/prompts", { cache: "no-store" }),
      ]);

      const settingsData = await settingsRes.json();
      const promptsData = await promptsRes.json();

      if (!settingsRes.ok || !settingsData.success) {
        throw new Error(settingsData.error || "读取会议设置失败");
      }
      if (!promptsRes.ok || !promptsData.success) {
        throw new Error(promptsData.error || "读取会议 Prompt 失败");
      }

      setSettings(settingsData.settings as SettingsPayload);
      setAvailableAgents(settingsData.availableAgents || []);
      setDefaultAgent(settingsData.defaultAgent || "");
      setPrompts(promptsData.prompts as MeetingPromptTextMap);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "读取会议设置失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleParticipant = (agentId: string) => {
    setSettings((prev) => {
      const selected = prev.meetingParticipants.includes(agentId);
      return {
        ...prev,
        meetingParticipants: selected
          ? prev.meetingParticipants.filter((id) => id !== agentId)
          : [...prev.meetingParticipants, agentId],
      };
    });
  };

  const toggleDiscussionStatus = (status: TaskStatus) => {
    setSettings((prev) => {
      const selected = prev.meetingDiscussionStatuses.includes(status);
      const nextStatuses = selected
        ? prev.meetingDiscussionStatuses.filter((item) => item !== status)
        : [...prev.meetingDiscussionStatuses, status];

      return {
        ...prev,
        meetingDiscussionStatuses: nextStatuses.length > 0 ? nextStatuses : prev.meetingDiscussionStatuses,
      };
    });
  };

  const saveAll = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const settingsRes = await fetch("/api/meetings/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const settingsData = await settingsRes.json();
      if (!settingsRes.ok || !settingsData.success) {
        throw new Error(settingsData.error || "保存会议设置失败");
      }

      const promptsRes = await fetch("/api/meetings/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: settings.meetingPromptFiles,
          prompts,
        }),
      });
      const promptsData = await promptsRes.json();
      if (!promptsRes.ok || !promptsData.success) {
        throw new Error(promptsData.error || "保存会议 Prompt 失败");
      }

      setSettings((prev) => ({
        ...prev,
        meetingPromptFiles: promptsData.files,
      }));
      setPrompts(promptsData.prompts);
      setMessage({ type: "success", text: "会议设置和 Prompt 已保存" });
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const triggerMeeting = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/meetings/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "触发会议失败");
      }
      setMessage({ type: "success", text: `会议已触发，ID: ${data.meetingId || "-"}` });
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "触发会议失败" });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
        <div className="text-sm text-[var(--text-muted)]">加载中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">🗓️ 会议设置</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">配置 Boss 会议时间、参会人和 Prompt 模板</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={triggerMeeting}
            disabled={running || saving}
            className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-60"
          >
            {running ? "执行中..." : "立即开会"}
          </button>
          <button
            onClick={saveAll}
            disabled={saving || running}
            className="px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存设置"}
          </button>
          <Link
            href="/meetings"
            className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)]"
          >
            查看会议记录
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 mb-6 space-y-4">
        <h2 className="text-lg font-semibold">会议调度</h2>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.meetingEnabled}
            onChange={(e) => setSettings((prev) => ({ ...prev, meetingEnabled: e.target.checked }))}
            className="h-4 w-4"
          />
          启用自动会议
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">每日会议时间</span>
            <input
              type="time"
              value={settings.meetingDailyTime}
              onChange={(e) => setSettings((prev) => ({ ...prev, meetingDailyTime: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
          <label className="text-sm space-y-1 block md:col-span-2">
            <span className="text-[var(--text-muted)]">时区</span>
            <input
              type="text"
              value={settings.meetingTimezone}
              onChange={(e) => setSettings((prev) => ({ ...prev, meetingTimezone: e.target.value }))}
              placeholder="Asia/Shanghai"
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 mb-6 space-y-4">
        <h2 className="text-lg font-semibold">参会员工（Boss 固定主持）</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {employeeCandidates.map((agentId) => {
            const selected = settings.meetingParticipants.includes(agentId);
            return (
              <label
                key={agentId}
                className={`rounded border px-3 py-2 text-sm cursor-pointer ${
                  selected ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleParticipant(agentId)}
                  className="mr-2 h-4 w-4"
                />
                {agentId}
              </label>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 mb-6 space-y-4">
        <h2 className="text-lg font-semibold">未完成工作讨论范围</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((status) => {
            const selected = settings.meetingDiscussionStatuses.includes(status.value);
            return (
              <label
                key={status.value}
                className={`rounded border px-3 py-2 text-sm cursor-pointer ${
                  selected ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleDiscussionStatus(status.value)}
                  className="mr-2 h-4 w-4"
                />
                {status.label}
              </label>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 space-y-4">
        <h2 className="text-lg font-semibold">会议 Prompt 模板</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">开场模板文件</span>
            <input
              type="text"
              value={settings.meetingPromptFiles.kickoff}
              onChange={(e) => setSettings((prev) => ({
                ...prev,
                meetingPromptFiles: { ...prev.meetingPromptFiles, kickoff: e.target.value },
              }))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">员工发言模板文件</span>
            <input
              type="text"
              value={settings.meetingPromptFiles.employee}
              onChange={(e) => setSettings((prev) => ({
                ...prev,
                meetingPromptFiles: { ...prev.meetingPromptFiles, employee: e.target.value },
              }))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">总结模板文件</span>
            <input
              type="text"
              value={settings.meetingPromptFiles.summary}
              onChange={(e) => setSettings((prev) => ({
                ...prev,
                meetingPromptFiles: { ...prev.meetingPromptFiles, summary: e.target.value },
              }))}
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
            />
          </label>
        </div>

        <label className="text-sm space-y-1 block">
          <span className="text-[var(--text-muted)]">Boss 开场 Prompt</span>
          <textarea
            value={prompts.kickoff}
            onChange={(e) => setPrompts((prev) => ({ ...prev, kickoff: e.target.value }))}
            className="w-full min-h-[180px] rounded border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs leading-5"
          />
        </label>

        <label className="text-sm space-y-1 block">
          <span className="text-[var(--text-muted)]">员工发言 Prompt</span>
          <textarea
            value={prompts.employee}
            onChange={(e) => setPrompts((prev) => ({ ...prev, employee: e.target.value }))}
            className="w-full min-h-[220px] rounded border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs leading-5"
          />
        </label>

        <label className="text-sm space-y-1 block">
          <span className="text-[var(--text-muted)]">Boss 总结 Prompt</span>
          <textarea
            value={prompts.summary}
            onChange={(e) => setPrompts((prev) => ({ ...prev, summary: e.target.value }))}
            className="w-full min-h-[220px] rounded border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs leading-5"
          />
        </label>
      </section>

      {message && (
        <div className={`mt-4 text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </div>
      )}
    </main>
  );
}
