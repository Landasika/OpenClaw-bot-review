"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MeetingRecord } from "@/lib/meeting-types";

function formatTime(ts?: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN");
}

function statusText(status: MeetingRecord["status"]): string {
  if (status === "running") return "进行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "待执行";
}

export default function MeetingsPage() {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<MeetingRecord | null>(null);
  const [error, setError] = useState<string>("");

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/meetings?limit=50", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "读取会议列表失败");
      }

      const list = Array.isArray(data.meetings) ? data.meetings : [];
      setMeetings(list);

      const nextSelectedId = selectedId || list[0]?.id || "";
      setSelectedId(nextSelectedId);
    } catch (err: any) {
      setError(err.message || "读取会议列表失败");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const fetchMeetingDetail = useCallback(async (meetingId: string) => {
    if (!meetingId) {
      setSelected(null);
      return;
    }

    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "读取会议详情失败");
      }
      setSelected(data.meeting || null);
    } catch (err: any) {
      setError(err.message || "读取会议详情失败");
      setSelected(null);
    }
  }, []);

  useEffect(() => {
    void fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    void fetchMeetingDetail(selectedId);
  }, [selectedId, fetchMeetingDetail]);

  const triggerMeeting = async () => {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/meetings/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "触发会议失败");
      }

      await fetchMeetings();
      if (data.meetingId) {
        setSelectedId(data.meetingId);
      }
    } catch (err: any) {
      setError(err.message || "触发会议失败");
    } finally {
      setRunning(false);
    }
  };

  const summary = useMemo(() => {
    if (!selected?.bossSummary) {
      return "暂无 Boss 总结。";
    }
    return selected.bossSummary;
  }, [selected?.bossSummary]);

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">🗂️ 团队会议记录</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">查看 Boss 与员工会议纪要、行动项和异常信息</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchMeetings()}
            disabled={loading || running}
            className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-60"
          >
            {loading ? "刷新中..." : "刷新"}
          </button>
          <button
            onClick={triggerMeeting}
            disabled={running || loading}
            className="px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {running ? "开会中..." : "立即开会"}
          </button>
          <Link
            href="/"
            className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)]"
          >
            返回总览
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-4 rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold">会议列表</div>
          <div className="max-h-[72vh] overflow-auto">
            {meetings.length === 0 ? (
              <div className="p-4 text-sm text-[var(--text-muted)]">暂无会议记录</div>
            ) : (
              <ul>
                {meetings.map((meeting) => {
                  const active = selectedId === meeting.id;
                  return (
                    <li key={meeting.id}>
                      <button
                        onClick={() => setSelectedId(meeting.id)}
                        className={`w-full text-left px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--bg)] transition ${
                          active ? "bg-[var(--accent)]/10" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{meeting.id}</span>
                          <span className="text-xs text-[var(--text-muted)]">{statusText(meeting.status)}</span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          {formatTime(meeting.startedAt)} · {meeting.participants.length} 人
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 space-y-4">
          {!selected ? (
            <div className="text-sm text-[var(--text-muted)]">请选择一条会议记录</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <h2 className="text-lg font-semibold">会议详情</h2>
                <div className="text-xs text-[var(--text-muted)]">
                  开始: {formatTime(selected.startedAt)} · 结束: {formatTime(selected.endedAt)}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-1">主持 Boss</div>
                  <div>{selected.bossAgentId}</div>
                </div>
                <div className="rounded border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-1">讨论任务状态</div>
                  <div>{selected.discussionStatuses.join(", ")}</div>
                </div>
              </div>

              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--text-muted)] mb-2">Boss 总结</div>
                <pre className="whitespace-pre-wrap text-sm leading-6">{summary}</pre>
              </div>

              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--text-muted)] mb-2">行动项</div>
                {selected.actionItems.length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">暂无行动项</div>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {selected.actionItems.map((item, idx) => (
                      <li key={`${selected.id}_action_${idx}`}>
                        <span className="font-medium">[{item.owner}]</span> {item.content}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--text-muted)] mb-2">发言记录</div>
                {selected.notes.length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">暂无发言记录</div>
                ) : (
                  <div className="space-y-3 max-h-[38vh] overflow-auto pr-1">
                    {selected.notes.map((note, idx) => (
                      <div key={`${selected.id}_note_${idx}`} className="rounded border border-[var(--border)] p-2">
                        <div className="text-xs text-[var(--text-muted)] mb-1">
                          {note.role === "boss" ? "Boss" : "员工"} · {note.agentName} ({note.agentId}) · {formatTime(note.timestamp)}
                        </div>
                        {note.error ? (
                          <div className="text-sm text-red-600">{note.error}</div>
                        ) : (
                          <pre className="whitespace-pre-wrap text-sm leading-6">{note.content || "(空)"}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selected.errors.length > 0 && (
                <div className="rounded border border-red-200 bg-red-50 p-3">
                  <div className="text-xs text-red-700 mb-2">执行异常</div>
                  <ul className="text-sm text-red-700 space-y-1">
                    {selected.errors.map((item, idx) => (
                      <li key={`${selected.id}_error_${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
