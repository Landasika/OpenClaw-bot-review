"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EpicProject } from "@/lib/epic-types";

type EditForm = {
  title: string;
  objective: string;
  successCriteria: string;
  frameworkPrompt: string;
  loopIntervalSeconds: string;
  durationLimitHours: string;
  durationUnlimited: boolean;
  callLimitTotal: string;
  callUnlimited: boolean;
};

function toEditForm(epic: EpicProject): EditForm {
  return {
    title: epic.title,
    objective: epic.objective,
    successCriteria: epic.successCriteria,
    frameworkPrompt: epic.frameworkPrompt,
    loopIntervalSeconds: String(epic.loopIntervalSeconds || 300),
    durationLimitHours: epic.durationLimitMs === null ? "" : String(Math.max(1, Math.round(epic.durationLimitMs / 3600000))),
    durationUnlimited: epic.durationLimitMs === null,
    callLimitTotal: epic.callLimitTotal === null ? "" : String(epic.callLimitTotal),
    callUnlimited: epic.callLimitTotal === null,
  };
}

export default function EditEpicPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const epicId = typeof params?.id === "string" ? params.id : "";
  const backHref = epicId ? `/epics?epicId=${epicId}` : "/epics";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [epic, setEpic] = useState<EpicProject | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);

  useEffect(() => {
    if (!epicId) {
      setError("缺少大任务 ID");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/epics/${epicId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success || !data.epic) {
          throw new Error(data.error || "读取大任务失败");
        }
        setEpic(data.epic as EpicProject);
        setForm(toEditForm(data.epic as EpicProject));
      } catch (err: any) {
        setError(err.message || "读取大任务失败");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [epicId]);

  const saveEpic = async () => {
    if (!form || !epicId) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (!form.title.trim() || !form.objective.trim() || !form.successCriteria.trim() || !form.frameworkPrompt.trim()) {
        throw new Error("请完整填写标题、目标、成功标准和大框架任务");
      }

      const durationLimitMs = form.durationUnlimited
        ? null
        : Math.max(1, Math.floor(Number(form.durationLimitHours || 0) * 60 * 60 * 1000));
      const callLimitTotal = form.callUnlimited
        ? null
        : Math.max(1, Math.floor(Number(form.callLimitTotal || 0)));

      const res = await fetch(`/api/epics/${epicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          objective: form.objective.trim(),
          successCriteria: form.successCriteria.trim(),
          frameworkPrompt: form.frameworkPrompt.trim(),
          loopIntervalSeconds: Math.max(10, Math.floor(Number(form.loopIntervalSeconds || 300))),
          durationLimitMs,
          callLimitTotal,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "更新大任务失败");
      }

      router.push(backHref);
    } catch (err: any) {
      setError(err.message || "更新大任务失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">✏️ 修改大任务</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">编辑当前大任务配置并保存</p>
        </div>
        <button
          onClick={() => router.push(backHref)}
          className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)]"
        >
          返回
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--text-muted)]">加载中...</div>
      ) : !epic || !form ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--text-muted)]">未找到大任务</div>
      ) : (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
          <div className="text-xs text-[var(--text-muted)]">任务 ID: <span className="font-mono">{epic.id}</span></div>

          <input
            value={form.title}
            onChange={(e) => setForm((prev) => prev ? ({ ...prev, title: e.target.value }) : prev)}
            placeholder="大任务标题"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            value={form.objective}
            onChange={(e) => setForm((prev) => prev ? ({ ...prev, objective: e.target.value }) : prev)}
            placeholder="大任务目标"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <textarea
            value={form.successCriteria}
            onChange={(e) => setForm((prev) => prev ? ({ ...prev, successCriteria: e.target.value }) : prev)}
            placeholder="成功标准（可验证）"
            className="w-full border rounded px-3 py-2 text-sm h-24"
          />
          <textarea
            value={form.frameworkPrompt}
            onChange={(e) => setForm((prev) => prev ? ({ ...prev, frameworkPrompt: e.target.value }) : prev)}
            placeholder="大框架任务说明"
            className="w-full border rounded px-3 py-2 text-sm h-32"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--text-muted)]">循环间隔(秒)</label>
              <input
                value={form.loopIntervalSeconds}
                onChange={(e) => setForm((prev) => prev ? ({ ...prev, loopIntervalSeconds: e.target.value }) : prev)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-muted)]">时长限制(小时)</label>
              <input
                value={form.durationLimitHours}
                onChange={(e) => setForm((prev) => prev ? ({ ...prev, durationLimitHours: e.target.value }) : prev)}
                disabled={form.durationUnlimited}
                className="w-full border rounded px-2 py-1.5 text-sm disabled:opacity-60"
              />
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.durationUnlimited}
                  onChange={(e) => setForm((prev) => prev ? ({ ...prev, durationUnlimited: e.target.checked }) : prev)}
                />
                无限时
              </label>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[var(--text-muted)]">调用次数上限</label>
              <input
                value={form.callLimitTotal}
                onChange={(e) => setForm((prev) => prev ? ({ ...prev, callLimitTotal: e.target.value }) : prev)}
                disabled={form.callUnlimited}
                className="w-full border rounded px-2 py-1.5 text-sm disabled:opacity-60"
              />
              <label className="inline-flex items-center gap-2 text-xs mt-1">
                <input
                  type="checkbox"
                  checked={form.callUnlimited}
                  onChange={(e) => setForm((prev) => prev ? ({ ...prev, callUnlimited: e.target.checked }) : prev)}
                />
                无限次
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => router.push(backHref)}
              className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)]"
            >
              取消
            </button>
            <button
              onClick={saveEpic}
              disabled={saving}
              className="px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存修改"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
