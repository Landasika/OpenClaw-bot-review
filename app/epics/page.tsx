"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EpicBoundTask, EpicIteration, EpicProject } from "@/lib/epic-types";
import type { Task } from "@/lib/task-types";

type EpicRuntime = {
  running: boolean;
  inProgress: boolean;
  lastRunAt?: number;
  lastError?: string;
};

type EpicWithRuntime = EpicProject & {
  runtime?: EpicRuntime;
};

type EpicDetail = EpicWithRuntime & {
  boundTasks?: EpicBoundTask[];
};

function formatTime(ts?: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN");
}

function statusBadge(status: EpicProject["status"]): string {
  if (status === "running") return "bg-green-600 text-white";
  if (status === "stopping") return "bg-amber-600 text-white";
  if (status === "completed") return "bg-blue-700 text-white";
  if (status === "failed") return "bg-red-700 text-white";
  if (status === "stopped") return "bg-zinc-700 text-white";
  return "bg-slate-700 text-white";
}

function statusLabel(status: EpicProject["status"]): string {
  if (status === "running") return "运行中";
  if (status === "stopping") return "停止中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "stopped") return "已停止";
  return "草稿";
}

function taskStatusBadge(status?: string): string {
  if (status === "approved") return "bg-green-600 text-white";
  if (status === "submitted") return "bg-blue-600 text-white";
  if (status === "in_progress") return "bg-amber-600 text-white";
  if (status === "assigned") return "bg-sky-600 text-white";
  if (status === "blocked") return "bg-red-700 text-white";
  if (status === "rejected" || status === "cancelled" || status === "missing") return "bg-zinc-700 text-white";
  return "bg-slate-700 text-white";
}

function taskStatusLabel(status?: string): string {
  if (status === "pending") return "待处理";
  if (status === "assigned") return "已分配";
  if (status === "blocked") return "已阻塞";
  if (status === "in_progress") return "进行中";
  if (status === "submitted") return "待审查";
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已驳回";
  if (status === "cancelled") return "已取消";
  if (status === "missing") return "不存在";
  return status || "未知";
}

function formatTaskDependencies(task: EpicBoundTask): string {
  if (task.dependencyStatuses && task.dependencyStatuses.length > 0) {
    return task.dependencyStatuses
      .map((item) => `${item.taskId}(${taskStatusLabel(item.status)})`)
      .join("，");
  }
  if (task.dependsOnTaskIds && task.dependsOnTaskIds.length > 0) {
    return task.dependsOnTaskIds.map((id) => `${id}(不存在)`).join("，");
  }
  return "无依赖";
}

function iterationActionLabel(action: string): string {
  if (action === "created") return "新建";
  if (action === "updated") return "更新";
  if (action === "skipped") return "跳过";
  if (action === "failed") return "失败";
  return action;
}

const DEFAULT_CREATE_FORM = {
  title: "",
  objective: "",
  successCriteria: "",
  frameworkPrompt: "",
  loopIntervalSeconds: "300",
  durationLimitHours: "",
  durationUnlimited: true,
  callLimitTotal: "",
  callUnlimited: true,
};

export default function EpicsPage() {
  const [preferredEpicId, setPreferredEpicId] = useState("");

  const [epics, setEpics] = useState<EpicWithRuntime[]>([]);
  const [selectedEpicId, setSelectedEpicId] = useState<string>("");
  const [selectedEpicDetail, setSelectedEpicDetail] = useState<EpicDetail | null>(null);
  const [iterations, setIterations] = useState<EpicIteration[]>([]);
  const [focusedIterationId, setFocusedIterationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reportPreview, setReportPreview] = useState("");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);

  const [activeBoundTask, setActiveBoundTask] = useState<EpicBoundTask | null>(null);
  const [activeBoundTaskDetail, setActiveBoundTaskDetail] = useState<Task | null>(null);
  const [boundTaskDetailLoading, setBoundTaskDetailLoading] = useState(false);
  const [boundTaskDetailError, setBoundTaskDetailError] = useState("");

  const selected = useMemo(() => {
    if (selectedEpicDetail && selectedEpicDetail.id === selectedEpicId) {
      return selectedEpicDetail;
    }
    return epics.find((item) => item.id === selectedEpicId) || null;
  }, [epics, selectedEpicDetail, selectedEpicId]);

  const boundTasks = useMemo(() => {
    if (!selectedEpicId || selectedEpicDetail?.id !== selectedEpicId) {
      return null;
    }
    return selectedEpicDetail.boundTasks || [];
  }, [selectedEpicDetail, selectedEpicId]);

  const focusedIteration = useMemo(() => {
    if (!iterations.length) {
      return null;
    }
    if (!focusedIterationId) {
      return iterations[0];
    }
    return iterations.find((item) => item.id === focusedIterationId) || iterations[0];
  }, [focusedIterationId, iterations]);

  const blockedTaskCount = useMemo(
    () => (boundTasks || []).filter((item) => item.status === "blocked").length,
    [boundTasks]
  );

  const nextRoundFocus = focusedIteration?.reviewerOutput?.nextRoundFocus || [];

  const focusedIterationHighlights = useMemo(() => {
    if (!focusedIteration) {
      return [];
    }

    const actionCounts = focusedIteration.taskOperationResults.reduce<Record<string, number>>((acc, item) => {
      acc[item.action] = (acc[item.action] || 0) + 1;
      return acc;
    }, {});
    const successTests = focusedIteration.testRuns.filter((item) => item.success).length;

    const lines = [
      `任务落地 ${focusedIteration.taskOperationResults.length} 项：新建 ${actionCounts.created || 0}，更新 ${actionCounts.updated || 0}，跳过 ${actionCounts.skipped || 0}，失败 ${actionCounts.failed || 0}`,
      `测试验证 ${focusedIteration.testRuns.length} 次：成功 ${successTests}，失败 ${focusedIteration.testRuns.length - successTests}`,
    ];

    for (const item of focusedIteration.taskOperationResults.slice(0, 6)) {
      lines.push(`${iterationActionLabel(item.action)} ${item.externalKey} -> ${item.taskId || "-"}${item.message ? ` · ${item.message}` : ""}`);
    }

    return lines;
  }, [focusedIteration]);

  const summaryDocumentPath = focusedIteration?.summaryDocumentPath || selected?.latestSummaryDocumentPath || "";
  const summaryGeneratedAt = focusedIteration?.summaryGeneratedAt || selected?.latestSummaryGeneratedAt;

  const fetchEpics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/epics?limit=100", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "读取大任务列表失败");
      }

      const list: EpicWithRuntime[] = Array.isArray(data.epics) ? data.epics : [];
      setEpics(list);

      const candidateId = preferredEpicId || selectedEpicId;
      const hasCandidate = !!candidateId && list.some((item) => item.id === candidateId);
      const nextId = hasCandidate ? candidateId : list[0]?.id || "";
      setSelectedEpicId(nextId);

      setSelectedEpicDetail((prev) => {
        if (!prev) {
          return null;
        }
        const summary = list.find((item) => item.id === prev.id);
        if (!summary) {
          return null;
        }
        return {
          ...prev,
          ...summary,
        };
      });
    } catch (err: any) {
      setError(err.message || "读取大任务列表失败");
    } finally {
      setLoading(false);
    }
  }, [preferredEpicId, selectedEpicId]);

  const fetchEpicDetail = useCallback(async (epicId: string) => {
    if (!epicId) {
      setIterations([]);
      return;
    }

    try {
      const [detailRes, iterRes] = await Promise.all([
        fetch(`/api/epics/${epicId}`, { cache: "no-store" }),
        fetch(`/api/epics/${epicId}/iterations?limit=30`, { cache: "no-store" }),
      ]);
      const [detailData, iterData] = await Promise.all([detailRes.json(), iterRes.json()]);

      if (!detailRes.ok || !detailData.success) {
        throw new Error(detailData.error || "读取大任务详情失败");
      }
      if (!iterRes.ok || !iterData.success) {
        throw new Error(iterData.error || "读取迭代历史失败");
      }

      setSelectedEpicDetail((detailData.epic || null) as EpicDetail | null);
      setIterations(Array.isArray(iterData.iterations) ? iterData.iterations : []);
      setReportPreview(detailData.epic?.latestReportMarkdown || "");
    } catch (err: any) {
      setError(err.message || "读取大任务详情失败");
      setIterations([]);
    }
  }, []);

  const closeBoundTaskDetail = () => {
    setActiveBoundTask(null);
    setActiveBoundTaskDetail(null);
    setBoundTaskDetailLoading(false);
    setBoundTaskDetailError("");
  };

  const openBoundTaskDetail = async (boundTask: EpicBoundTask) => {
    setActiveBoundTask(boundTask);
    setActiveBoundTaskDetail(null);
    setBoundTaskDetailError("");

    if (!boundTask.exists) {
      setBoundTaskDetailError("该子任务不存在，可能已经被删除。");
      return;
    }

    setBoundTaskDetailLoading(true);
    try {
      const res = await fetch(`/api/tasks/${boundTask.taskId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "读取子任务详情失败");
      }
      setActiveBoundTaskDetail((data.task || null) as Task | null);
    } catch (err: any) {
      setBoundTaskDetailError(err.message || "读取子任务详情失败");
    } finally {
      setBoundTaskDetailLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncPreferredEpicId = () => {
      const epicIdFromUrl = new URLSearchParams(window.location.search).get("epicId") || "";
      setPreferredEpicId(epicIdFromUrl);
    };

    syncPreferredEpicId();
    window.addEventListener("popstate", syncPreferredEpicId);
    return () => {
      window.removeEventListener("popstate", syncPreferredEpicId);
    };
  }, []);

  useEffect(() => {
    void fetchEpics();
  }, [fetchEpics]);

  useEffect(() => {
    if (!selectedEpicId) {
      setIterations([]);
      setSelectedEpicDetail(null);
      setFocusedIterationId("");
      closeBoundTaskDetail();
      return;
    }
    void fetchEpicDetail(selectedEpicId);
  }, [selectedEpicId, fetchEpicDetail]);

  useEffect(() => {
    if (iterations.length === 0) {
      setFocusedIterationId("");
      return;
    }

    setFocusedIterationId((prev) => (
      prev && iterations.some((item) => item.id === prev) ? prev : iterations[0].id
    ));
  }, [iterations]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchEpics();
      if (selectedEpicId) {
        void fetchEpicDetail(selectedEpicId);
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [fetchEpics, fetchEpicDetail, selectedEpicId]);

  const openCreateDialog = () => {
    setCreateDialogOpen(true);
    setError("");
    setMessage("");
  };

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
    setCreateForm(DEFAULT_CREATE_FORM);
  };

  const createEpic = async () => {
    setActionLoading("create");
    setError("");
    setMessage("");

    try {
      if (!createForm.title.trim() || !createForm.objective.trim() || !createForm.successCriteria.trim() || !createForm.frameworkPrompt.trim()) {
        throw new Error("请完整填写标题、目标、成功标准和大框架任务");
      }

      const durationLimitMs = createForm.durationUnlimited
        ? null
        : Math.max(1, Math.floor(Number(createForm.durationLimitHours || 0) * 60 * 60 * 1000));
      const callLimitTotal = createForm.callUnlimited
        ? null
        : Math.max(1, Math.floor(Number(createForm.callLimitTotal || 0)));

      const res = await fetch("/api/epics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createForm.title.trim(),
          objective: createForm.objective.trim(),
          successCriteria: createForm.successCriteria.trim(),
          frameworkPrompt: createForm.frameworkPrompt.trim(),
          loopIntervalSeconds: Math.max(10, Math.floor(Number(createForm.loopIntervalSeconds || 300))),
          durationLimitMs,
          callLimitTotal,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "创建大任务失败");
      }

      setMessage("大任务已创建");
      closeCreateDialog();

      await fetchEpics();
      if (data.epic?.id) {
        setSelectedEpicId(data.epic.id);
      }
    } catch (err: any) {
      setError(err.message || "创建大任务失败");
    } finally {
      setActionLoading(null);
    }
  };

  const runControlAction = async (action: "start" | "stop" | "run_once" | "report") => {
    if (!selectedEpicId) {
      return;
    }

    setActionLoading(action);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/epics/${selectedEpicId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `操作失败: ${action}`);
      }

      if (typeof data.reportMarkdown === "string") {
        setReportPreview(data.reportMarkdown);
      }
      setMessage(data.message || "操作成功");
      await fetchEpics();
      await fetchEpicDetail(selectedEpicId);
    } catch (err: any) {
      setError(err.message || "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteEpic = async () => {
    if (!selectedEpicId) {
      return;
    }
    const ok = window.confirm("确认删除该大任务及其迭代历史？");
    if (!ok) {
      return;
    }

    setActionLoading("delete");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/epics/${selectedEpicId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "删除失败");
      }
      setMessage("大任务已删除");
      setSelectedEpicId("");
      setSelectedEpicDetail(null);
      setIterations([]);
      setFocusedIterationId("");
      setReportPreview("");
      closeBoundTaskDetail();
      await fetchEpics();
    } catch (err: any) {
      setError(err.message || "删除失败");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🧩 大任务管理</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            主页面展示当前大任务；列表与新建作为子卡片管理
          </p>
        </div>
        <button
          onClick={() => void fetchEpics()}
          disabled={loading || actionLoading !== null}
          className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-60"
        >
          {loading ? "刷新中..." : "刷新"}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <aside className="lg:col-span-4 space-y-4">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">新建大任务</h2>
                <div className="text-xs text-[var(--text-muted)] mt-1">点击新建后弹窗创建</div>
              </div>
              <button
                onClick={openCreateDialog}
                disabled={actionLoading !== null}
                className="px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 disabled:opacity-60"
              >
                新建
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-lg font-semibold">大任务列表</h2>
              <span className="text-xs text-[var(--text-muted)]">{epics.length} 项</span>
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-auto pr-1">
              {epics.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">暂无大任务</div>
              ) : (
                epics.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedEpicId(item.id)}
                    className={`w-full text-left rounded border px-3 py-2 text-sm ${
                      selectedEpicId === item.id
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border)] hover:border-[var(--accent)]/60"
                    }`}
                  >
                    <div className="font-medium truncate">{item.title}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      轮次 {item.iterationsCompleted} · 调用 {item.totalCallsUsed}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="lg:col-span-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 space-y-4">
        {!selected ? (
          <div className="text-sm text-[var(--text-muted)]">请选择一个大任务查看详情</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-[var(--text-muted)]">当前大任务</div>
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  创建: {formatTime(selected.createdAt)} · 最近迭代: {formatTime(selected.lastIterationAt)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/epics/${selected.id}/edit`}
                  className="px-3 py-1.5 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)]"
                >
                  修改
                </Link>
                {selected.runtime?.inProgress && (
                  <span className="rounded px-2 py-1 text-xs bg-blue-600 text-white">
                    本轮执行中
                  </span>
                )}
                <span className={`rounded px-2 py-1 text-xs ${statusBadge(selected.status)}`}>
                  {statusLabel(selected.status)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 text-sm">
              <div className="rounded border border-[var(--border)] p-2">
                <div className="text-xs text-[var(--text-muted)]">已完成轮次</div>
                <div className="font-semibold">{selected.iterationsCompleted}</div>
              </div>
              <div className="rounded border border-[var(--border)] p-2">
                <div className="text-xs text-[var(--text-muted)]">累计调用</div>
                <div className="font-semibold">{selected.totalCallsUsed}</div>
              </div>
              <div className="rounded border border-[var(--border)] p-2">
                <div className="text-xs text-[var(--text-muted)]">调用上限</div>
                <div className="font-semibold">{selected.callLimitTotal === null ? "无限" : selected.callLimitTotal}</div>
              </div>
              <div className="rounded border border-[var(--border)] p-2">
                <div className="text-xs text-[var(--text-muted)]">时长上限</div>
                <div className="font-semibold">
                  {selected.durationLimitMs === null ? "无限" : `${Math.round(selected.durationLimitMs / 3600000)}h`}
                </div>
              </div>
              <div className="rounded border border-[var(--border)] p-2">
                <div className="text-xs text-[var(--text-muted)]">待承接建议</div>
                <div className="font-semibold">{nextRoundFocus.length}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1">阻塞子任务 {blockedTaskCount}</div>
              </div>
            </div>

            {selected.runtime?.lastError && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                最近运行提示：{selected.runtime.lastError}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runControlAction("start")}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {actionLoading === "start" ? "启动中..." : "开始循环"}
              </button>
              <button
                onClick={() => runControlAction("stop")}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-60"
              >
                {actionLoading === "stop" ? "停止中..." : "停止（优雅）"}
              </button>
              <button
                onClick={() => runControlAction("run_once")}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {actionLoading === "run_once" ? "执行中..." : "立即执行一轮"}
              </button>
              <button
                onClick={() => runControlAction("report")}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-60"
              >
                {actionLoading === "report" ? "汇报中..." : "汇报当前进度"}
              </button>
              <button
                onClick={deleteEpic}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm hover:bg-red-50 disabled:opacity-60"
              >
                {actionLoading === "delete" ? "删除中..." : "删除大任务"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--text-muted)] mb-1">当前判断</div>
                <div className="whitespace-pre-wrap leading-6">
                  {focusedIteration?.reviewerOutput?.overallProgress || focusedIteration?.error || "暂无轮次判断"}
                </div>
              </div>
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--text-muted)] mb-2">下一步建议</div>
                {nextRoundFocus.length > 0 ? (
                  <div className="space-y-2">
                    {nextRoundFocus.map((item, index) => (
                      <div key={`${focusedIteration?.id || "latest"}-focus-${index}`} className="rounded border border-[var(--border)] px-3 py-2">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[var(--text-muted)]">暂无下一步建议，建议先执行一轮。</div>
                )}
              </div>
            </div>

            <div className="rounded border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <div className="text-xs text-[var(--text-muted)]">轮次总结文档</div>
                  <div className="text-sm font-medium">
                    {focusedIteration ? `第 ${focusedIteration.iterationNo} 轮总结` : "暂无轮次总结"}
                  </div>
                </div>
                <div className="text-right text-xs text-[var(--text-muted)]">
                  <div>{summaryDocumentPath ? "已落盘" : "未生成物理文档"}</div>
                  <div>{summaryGeneratedAt ? formatTime(summaryGeneratedAt) : "-"}</div>
                </div>
              </div>
              <div className="rounded border border-[var(--border)] bg-black/5 px-3 py-2 text-xs font-mono break-all">
                {summaryDocumentPath || "当前轮次还没有总结文档路径"}
              </div>
              <div className="mt-3">
                {focusedIteration ? (
                  <pre className="whitespace-pre-wrap text-sm leading-6 max-h-[38vh] overflow-auto pr-1">
                    {focusedIteration.reportMarkdown || "该轮次暂无总结正文"}
                  </pre>
                ) : (
                  <div className="text-sm text-[var(--text-muted)]">暂无轮次总结文档</div>
                )}
              </div>
            </div>

            <div className="rounded border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--text-muted)] mb-2">本轮做了什么</div>
              {focusedIterationHighlights.length > 0 ? (
                <div className="space-y-2">
                  {focusedIterationHighlights.map((item, index) => (
                    <div key={`${focusedIteration?.id || "latest"}-highlight-${index}`} className="rounded border border-[var(--border)] px-3 py-2 text-sm">
                      {item}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--text-muted)]">当前轮次暂无执行摘要</div>
              )}
            </div>

            <div className="rounded border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--text-muted)] mb-2">最近轮次与承接历史</div>
              {iterations.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">暂无迭代记录</div>
              ) : (
                <div className="space-y-2 max-h-[28vh] overflow-auto pr-1">
                  {iterations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFocusedIterationId(item.id)}
                      className={`w-full rounded border p-2 text-left ${
                        focusedIteration?.id === item.id
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : "border-[var(--border)] hover:border-[var(--accent)]/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">第 {item.iterationNo} 轮</span>
                        <span
                          className={`text-xs rounded px-2 py-0.5 ${
                            item.status === "completed" ? "bg-green-600 text-white" : "bg-red-700 text-white"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        {formatTime(item.startedAt)} ~ {formatTime(item.endedAt)} · 调用 {item.callsUsed}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        {item.summaryDocumentPath ? "有总结文档" : "仅保存了轮次记录"}
                      </div>
                      {item.error && <div className="text-xs text-red-700 mt-1">{item.error}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--text-muted)] mb-1">目标</div>
                <div className="whitespace-pre-wrap">{selected.objective}</div>
              </div>
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--text-muted)] mb-1">成功标准</div>
                <div className="whitespace-pre-wrap">{selected.successCriteria}</div>
              </div>
            </div>

            <div className="rounded border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--text-muted)] mb-1">大框架任务</div>
              <pre className="whitespace-pre-wrap text-sm">{selected.frameworkPrompt}</pre>
            </div>

            <div className="rounded border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--text-muted)] mb-2">子任务 ID 跟踪</div>
              {boundTasks === null ? (
                <div className="text-sm text-[var(--text-muted)]">子任务信息加载中...</div>
              ) : boundTasks.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">当前大任务暂无拆分子任务</div>
              ) : (
                <div className="space-y-2 max-h-[24vh] overflow-auto pr-1">
                  {boundTasks.map((item) => (
                    <div key={`${item.externalKey}-${item.taskId}`} className="rounded border border-[var(--border)] p-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-[var(--text-muted)]">
                            externalKey: <span className="font-mono">{item.externalKey}</span>
                          </div>
                          <button
                            onClick={() => void openBoundTaskDetail(item)}
                            className={`mt-1 font-mono text-sm underline decoration-dotted underline-offset-4 ${
                              item.exists ? "text-blue-600 hover:text-blue-700" : "text-red-700 hover:text-red-800"
                            }`}
                          >
                            {item.taskId}
                          </button>
                          {item.title && <div className="text-sm mt-1 truncate">{item.title}</div>}
                          <div className="text-xs text-[var(--text-muted)] mt-1 break-all">
                            依赖: {formatTaskDependencies(item)}
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <span className={`inline-flex rounded px-2 py-0.5 ${taskStatusBadge(item.status)}`}>
                            {taskStatusLabel(item.status)}
                          </span>
                          <div className="text-[var(--text-muted)] mt-1">{item.assignedTo || "未分配"}</div>
                          <div className="text-[var(--text-muted)] mt-1">{formatTime(item.updatedAt)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {reportPreview ? (
              reportPreview !== focusedIteration?.reportMarkdown ? (
                <div className="rounded border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-2">即时进度汇报（手动生成/飞书推送）</div>
                  <pre className="whitespace-pre-wrap text-sm leading-6 max-h-[34vh] overflow-auto pr-1">{reportPreview}</pre>
                </div>
              ) : null
            ) : (
              <div className="rounded border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
                暂无即时进度汇报，点击“汇报当前进度”可生成一份对外同步报告。
              </div>
            )}
          </>
        )}
        </section>
      </div>

      {createDialogOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 p-4 md:p-8 flex items-center justify-center"
          onClick={closeCreateDialog}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 space-y-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">新建大任务</h3>
                <div className="text-xs text-[var(--text-muted)] mt-1">填写大任务基础信息后创建</div>
              </div>
              <button
                onClick={closeCreateDialog}
                className="px-2.5 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)]"
              >
                关闭
              </button>
            </div>

            <input
              value={createForm.title}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="大任务标题"
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <input
              value={createForm.objective}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, objective: e.target.value }))}
              placeholder="大任务目标"
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <textarea
              value={createForm.successCriteria}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, successCriteria: e.target.value }))}
              placeholder="成功标准（可验证）"
              className="w-full border rounded px-3 py-2 text-sm h-20"
            />
            <textarea
              value={createForm.frameworkPrompt}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, frameworkPrompt: e.target.value }))}
              placeholder="大框架任务说明"
              className="w-full border rounded px-3 py-2 text-sm h-28"
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-[var(--text-muted)]">循环间隔(秒)</label>
                <input
                  value={createForm.loopIntervalSeconds}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, loopIntervalSeconds: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[var(--text-muted)]">时长限制(小时)</label>
                <input
                  value={createForm.durationLimitHours}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, durationLimitHours: e.target.value }))}
                  disabled={createForm.durationUnlimited}
                  className="w-full border rounded px-2 py-1.5 text-sm disabled:opacity-60"
                />
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={createForm.durationUnlimited}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, durationUnlimited: e.target.checked }))}
                  />
                  无限时
                </label>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-[var(--text-muted)]">调用次数上限</label>
                <input
                  value={createForm.callLimitTotal}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, callLimitTotal: e.target.value }))}
                  disabled={createForm.callUnlimited}
                  className="w-full border rounded px-2 py-1.5 text-sm disabled:opacity-60"
                />
                <label className="inline-flex items-center gap-2 text-xs mt-1">
                  <input
                    type="checkbox"
                    checked={createForm.callUnlimited}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, callUnlimited: e.target.checked }))}
                  />
                  无限次
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={closeCreateDialog}
                className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)]"
              >
                取消
              </button>
              <button
                onClick={createEpic}
                disabled={actionLoading !== null}
                className="px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 disabled:opacity-60"
              >
                {actionLoading === "create" ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeBoundTask && (
        <div
          className="fixed inset-0 z-50 bg-black/40 p-4 md:p-8 flex items-center justify-center"
          onClick={closeBoundTaskDetail}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5 space-y-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">子任务详情</h3>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  externalKey: <span className="font-mono">{activeBoundTask.externalKey}</span>
                </div>
              </div>
              <button
                onClick={closeBoundTaskDetail}
                className="px-2.5 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)]"
              >
                关闭
              </button>
            </div>

            <div className="rounded border border-[var(--border)] p-3 text-sm">
              <div className="text-xs text-[var(--text-muted)] mb-1">任务 ID</div>
              <div className="font-mono break-all">{activeBoundTask.taskId}</div>
            </div>

            {boundTaskDetailLoading ? (
              <div className="text-sm text-[var(--text-muted)]">加载子任务详情中...</div>
            ) : boundTaskDetailError ? (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {boundTaskDetailError}
              </div>
            ) : activeBoundTaskDetail ? (
              <div className="space-y-3">
                <div className="rounded border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-1">标题</div>
                  <div className="text-sm">{activeBoundTaskDetail.title}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border border-[var(--border)] p-2">
                    <div className="text-xs text-[var(--text-muted)]">状态</div>
                    <div className="font-semibold">{taskStatusLabel(activeBoundTaskDetail.status)}</div>
                  </div>
                  <div className="rounded border border-[var(--border)] p-2">
                    <div className="text-xs text-[var(--text-muted)]">执行人</div>
                    <div className="font-semibold">{activeBoundTaskDetail.assignedTo || "未分配"}</div>
                  </div>
                  <div className="rounded border border-[var(--border)] p-2">
                    <div className="text-xs text-[var(--text-muted)]">优先级</div>
                    <div className="font-semibold">{activeBoundTaskDetail.priority}</div>
                  </div>
                  <div className="rounded border border-[var(--border)] p-2">
                    <div className="text-xs text-[var(--text-muted)]">更新时间</div>
                    <div className="font-semibold">{formatTime(activeBoundTaskDetail.updatedAt)}</div>
                  </div>
                </div>
                <div className="rounded border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-1">任务描述</div>
                  <pre className="whitespace-pre-wrap text-sm">{activeBoundTaskDetail.description}</pre>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[var(--text-muted)]">暂无可展示的子任务详情</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
