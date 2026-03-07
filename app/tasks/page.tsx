"use client";

import { useState, useEffect, useMemo } from "react";
import type { Task } from "../../lib/task-types";

interface SystemConfigData {
  availableAgents?: string[];
  agentDisplayNameMap?: Record<string, string>;
}

const STATUS_LABEL_MAP: Record<string, string> = {
  all: "全部",
  pending: "待处理",
  assigned: "已分配",
  blocked: "已阻塞",
  in_progress: "进行中",
  submitted: "待审查",
  approved: "已通过",
  rejected: "已驳回",
  cancelled: "已取消",
  missing: "未知",
};

const PRIORITY_LABEL_MAP: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [agentDisplayNameMap, setAgentDisplayNameMap] = useState<Record<string, string>>({});
  const [allTasksForDependency, setAllTasksForDependency] = useState<Task[]>([]);
  const [dependencyDraft, setDependencyDraft] = useState<string[]>([]);
  const [dependencySaving, setDependencySaving] = useState(false);
  const [dependencyMessage, setDependencyMessage] = useState<string | null>(null);
  const [redispatchingTaskId, setRedispatchingTaskId] = useState<string | null>(null);
  const [redispatchMessage, setRedispatchMessage] = useState<string | null>(null);
  const [redispatchMessageTaskId, setRedispatchMessageTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkActionRunning, setBulkActionRunning] = useState<"redispatch" | "delete" | null>(null);
  const [bulkActionMessage, setBulkActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // 新任务表单
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    assignedTo: "",
    dueDate: "",
    dependsOnTaskIds: [] as string[],
  });

  // 审查表单
  const [reviewForm, setReviewForm] = useState({
    approved: true,
    comment: "",
    score: 5,
    createFollowUp: false,
    followUpTitle: "",
    followUpDescription: "",
  });

  useEffect(() => {
    loadTasks();
  }, [filter]);

  useEffect(() => {
    setDependencyDraft(selectedTask?.dependsOnTaskIds || []);
    setDependencyMessage(null);
  }, [selectedTask?.id]);

  useEffect(() => {
    fetch("/api/system-config")
      .then((res) => res.json())
      .then((data: SystemConfigData) => {
        setAvailableAgents(data.availableAgents || []);
        setAgentDisplayNameMap(data.agentDisplayNameMap || {});
      })
      .catch((error) => {
        console.error("Failed to load system config:", error);
      });
  }, []);

  const loadTasks = async () => {
    try {
      const url = filter === "all"
        ? "/api/tasks"
        : `/api/tasks?status=${filter}`;
      const [filteredRes, allRes] = await Promise.all([
        fetch(url),
        fetch("/api/tasks"),
      ]);
      const [filteredData, allData] = await Promise.all([
        filteredRes.json(),
        allRes.json(),
      ]);

      if (filteredData.success) {
        const filteredTasks = filteredData.tasks as Task[];
        setTasks(filteredTasks);
        setSelectedTaskIds((prev) =>
          prev.filter((id) => filteredTasks.some((task) => task.id === id))
        );
      }
      if (allData.success) {
        setAllTasksForDependency(allData.tasks);
      }
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const createTask = async () => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newTask,
          dependsOnTaskIds: newTask.dependsOnTaskIds,
          dueDate: newTask.dueDate ? new Date(newTask.dueDate).getTime() : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddTask(false);
        setNewTask({
          title: "",
          description: "",
          priority: "medium",
          assignedTo: "",
          dueDate: "",
          dependsOnTaskIds: [],
        });
        loadTasks();
      } else {
        alert(data.error || "创建任务失败");
      }
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  };

  const assignTask = async (taskId: string, assignedTo: string) => {
    try {
      const res = await fetch("/api/tasks/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, assignedTo }),
      });
      const data = await res.json();
      if (data.success) {
        loadTasks();
      }
    } catch (error) {
      console.error("Failed to assign task:", error);
    }
  };

  const reviewTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewForm),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedTask(null);
        setReviewForm({
          approved: true,
          comment: "",
          score: 5,
          createFollowUp: false,
          followUpTitle: "",
          followUpDescription: "",
        });
        loadTasks();
      }
    } catch (error) {
      console.error("Failed to review task:", error);
    }
  };

  const performRedispatch = async (task: Task): Promise<{ success: true; task: Task } | { success: false; error: string }> => {
    if (!task.assignedTo) {
      return { success: false, error: "任务未分配执行人，无法重新下发" };
    }

    try {
      let latestTask = task;
      if (!["assigned", "blocked"].includes(task.status)) {
        const patchRes = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "assigned",
            assignedTo: task.assignedTo,
          }),
        });
        const patchData = await patchRes.json();
        if (!patchData.success) {
          return { success: false, error: patchData.error || "任务状态更新失败" };
        }
        latestTask = patchData.task;
      }

      const dispatchRes = await fetch("/api/tasks/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: latestTask.id,
          waitForIdle: true,
        }),
      });
      const dispatchData = await dispatchRes.json();
      if (!dispatchData.success) {
        return {
          success: false,
          error: dispatchData.dispatch?.error || dispatchData.error || "重新下发失败",
        };
      }

      return { success: true, task: dispatchData.task || latestTask };
    } catch (error: any) {
      return { success: false, error: error.message || "重新下发失败" };
    }
  };

  const redispatchTask = async (task: Task, options?: { syncSelectedTask?: boolean; reload?: boolean }) => {
    setRedispatchingTaskId(task.id);
    setRedispatchMessageTaskId(task.id);
    setRedispatchMessage(null);

    const result = await performRedispatch(task);
    if (!result.success) {
      setRedispatchMessageTaskId(task.id);
      setRedispatchMessage(result.error);
      setRedispatchingTaskId(null);
      return;
    }

    if (options?.syncSelectedTask !== false || selectedTask?.id === result.task.id) {
      setSelectedTask(result.task);
    }
    setRedispatchMessage("任务已重新下发");

    if (options?.reload !== false) {
      await loadTasks();
    }

    setRedispatchingTaskId(null);
  };

  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskIdSet.has(task.id)),
    [tasks, selectedTaskIdSet]
  );
  const allVisibleSelected = tasks.length > 0 && tasks.every((task) => selectedTaskIdSet.has(task.id));

  const toggleTaskSelection = (taskId: string) => {
    setBulkActionMessage(null);
    setSelectedTaskIds((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const toggleSelectAllVisible = () => {
    if (tasks.length === 0) {
      return;
    }
    const visibleIds = tasks.map((task) => task.id);
    setBulkActionMessage(null);
    setSelectedTaskIds((prev) => {
      const allSelected = visibleIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const bulkRedispatchTasks = async () => {
    if (selectedTasks.length === 0) {
      setBulkActionMessage({ text: "请先选择任务", type: "error" });
      return;
    }

    setBulkActionRunning("redispatch");
    setBulkActionMessage(null);

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    let firstError = "";
    const succeededTaskIds: string[] = [];

    for (const task of selectedTasks) {
      if (!task.assignedTo || ["in_progress", "submitted"].includes(task.status)) {
        skipCount += 1;
        continue;
      }

      const result = await performRedispatch(task);
      if (result.success) {
        successCount += 1;
        succeededTaskIds.push(task.id);
      } else {
        failCount += 1;
        if (!firstError) {
          firstError = `${task.title}: ${result.error}`;
        }
      }
    }

    await loadTasks();
    if (succeededTaskIds.length > 0) {
      setSelectedTaskIds((prev) => prev.filter((id) => !succeededTaskIds.includes(id)));
    }

    const summary = `批量重新下发完成：成功 ${successCount}，跳过 ${skipCount}，失败 ${failCount}${
      firstError ? `。示例失败：${firstError}` : ""
    }`;
    setBulkActionMessage({
      text: summary,
      type: failCount > 0 ? "error" : "success",
    });
    setBulkActionRunning(null);
  };

  const bulkDeleteTasks = async () => {
    if (selectedTasks.length === 0) {
      setBulkActionMessage({ text: "请先选择任务", type: "error" });
      return;
    }

    const confirmed = window.confirm(`确认删除已选 ${selectedTasks.length} 个任务吗？该操作不可恢复。`);
    if (!confirmed) {
      return;
    }

    setBulkActionRunning("delete");
    setBulkActionMessage(null);

    let successCount = 0;
    let failCount = 0;
    let firstError = "";
    const deletedTaskIds: string[] = [];

    for (const task of selectedTasks) {
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          successCount += 1;
          deletedTaskIds.push(task.id);
        } else {
          failCount += 1;
          if (!firstError) {
            firstError = `${task.title}: ${data.error || "删除失败"}`;
          }
        }
      } catch (error: any) {
        failCount += 1;
        if (!firstError) {
          firstError = `${task.title}: ${error.message || "删除失败"}`;
        }
      }
    }

    await loadTasks();
    if (deletedTaskIds.length > 0) {
      setSelectedTaskIds((prev) => prev.filter((id) => !deletedTaskIds.includes(id)));
    }

    const summary = `批量删除完成：成功 ${successCount}，失败 ${failCount}${
      firstError ? `。示例失败：${firstError}` : ""
    }`;
    setBulkActionMessage({
      text: summary,
      type: failCount > 0 ? "error" : "success",
    });
    setBulkActionRunning(null);
  };

  const saveDependencies = async () => {
    if (!selectedTask) {
      return;
    }

    setDependencySaving(true);
    setDependencyMessage(null);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependsOnTaskIds: dependencyDraft }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "更新依赖失败");
      }
      setSelectedTask(data.task);
      setDependencyDraft(data.task.dependsOnTaskIds || []);
      setDependencyMessage("依赖已更新");
      await loadTasks();
    } catch (error: any) {
      setDependencyMessage(error.message || "更新依赖失败");
    } finally {
      setDependencySaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-slate-700 text-white",
      assigned: "bg-blue-700 text-white",
      in_progress: "bg-amber-700 text-white",
      submitted: "bg-indigo-700 text-white",
      approved: "bg-green-700 text-white",
      rejected: "bg-red-700 text-white",
      blocked: "bg-orange-700 text-white",
      cancelled: "bg-zinc-700 text-white",
      missing: "bg-gray-700 text-white",
    };
    return colors[status] || "bg-gray-700 text-white";
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-slate-700 text-white",
      medium: "bg-sky-700 text-white",
      high: "bg-orange-700 text-white",
      urgent: "bg-red-800 text-white",
    };
    return colors[priority] || "bg-slate-700 text-white";
  };

  const getStatusLabel = (status: string) => STATUS_LABEL_MAP[status] || status;
  const getPriorityLabel = (priority: string) => PRIORITY_LABEL_MAP[priority] || priority;

  const taskMap = useMemo(() => {
    return new Map(allTasksForDependency.map((task) => [task.id, task]));
  }, [allTasksForDependency]);

  if (loading) {
    return <div className="p-8 text-center">加载中...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">任务管理</h1>
        <button
          onClick={() => setShowAddTask(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + 新建任务
        </button>
      </div>

      {/* 筛选器 */}
      <div className="mb-6 flex gap-2">
        {["all", "pending", "assigned", "blocked", "in_progress", "submitted", "approved", "rejected"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1 rounded border text-sm font-medium transition-colors ${
              filter === status
                ? "bg-blue-700 text-white border-blue-800"
                : "bg-gray-100 text-gray-900 border-gray-400 hover:bg-gray-200"
            }`}
          >
            {getStatusLabel(status)}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
        <label className="inline-flex items-center gap-2 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
            disabled={tasks.length === 0 || bulkActionRunning !== null}
          />
          全选当前列表
        </label>

        <span className="text-xs text-[var(--text-muted)]">已选 {selectedTaskIds.length} 项</span>

        <button
          type="button"
          onClick={bulkRedispatchTasks}
          disabled={selectedTaskIds.length === 0 || bulkActionRunning !== null}
          className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {bulkActionRunning === "redispatch" ? "批量重新下发中..." : "批量重新下发"}
        </button>

        <button
          type="button"
          onClick={bulkDeleteTasks}
          disabled={selectedTaskIds.length === 0 || bulkActionRunning !== null}
          className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm"
        >
          {bulkActionRunning === "delete" ? "批量删除中..." : "批量删除"}
        </button>

        {bulkActionMessage && (
          <span className={`text-xs ${bulkActionMessage.type === "error" ? "text-red-600" : "text-green-600"}`}>
            {bulkActionMessage.text}
          </span>
        )}
      </div>

      {/* 任务列表 */}
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          当前筛选下暂无任务
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => {
            const checked = selectedTaskIdSet.has(task.id);
            return (
              <div
                key={task.id}
                className="group rounded-xl border border-[var(--border)] bg-[var(--card)] transition-all hover:border-[var(--accent)]/50 hover:shadow-lg"
              >
                <div className="border-b border-[var(--border)] px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTaskSelection(task.id)}
                      disabled={bulkActionRunning !== null}
                    />
                    选择任务
                  </label>
                </div>

                <button
                  type="button"
                  className="w-full p-3 text-left"
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
                      {task.title}
                    </h3>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${getPriorityColor(task.priority)}`}>
                      {getPriorityLabel(task.priority)}
                    </span>
                  </div>

                  <p className="mt-1 h-8 overflow-hidden text-xs leading-4 text-[var(--text-muted)]">
                    {task.description || "无描述"}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${getStatusColor(task.status)}`}>
                      {getStatusLabel(task.status)}
                    </span>
                    <span className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                      {task.assignedTo ? `👤 ${agentDisplayNameMap[task.assignedTo] || task.assignedTo}` : "👤 未分配"}
                    </span>
                  </div>

                  <div className="mt-2 space-y-0.5 text-[11px] text-[var(--text-muted)]">
                    <div>创建: {new Date(task.createdAt).toLocaleString("zh-CN")}</div>
                    {task.dueDate && <div>截止: {new Date(task.dueDate).toLocaleString("zh-CN")}</div>}
                  </div>

                  {task.status === "blocked" && task.blockedReason && (
                    <div className="mt-2 rounded border border-orange-300/40 bg-orange-100/70 px-1.5 py-0.5 text-[11px] text-orange-800">
                      阻塞: {task.blockedReason}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 新建任务弹窗 */}
      {showAddTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">新建任务</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">标题</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 h-32"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">优先级</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">紧急</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">分配给</label>
                  <select
                    value={newTask.assignedTo}
                    onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">暂不分配</option>
                    {availableAgents.map((agentId) => (
                      <option key={agentId} value={agentId}>
                        {agentDisplayNameMap[agentId] || agentId}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">截止日期</label>
                  <input
                    type="datetime-local"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">依赖任务（可多选）</label>
                  <select
                    multiple
                    value={newTask.dependsOnTaskIds}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions).map((option) => option.value);
                      setNewTask({ ...newTask, dependsOnTaskIds: values });
                    }}
                    className="w-full border rounded-lg px-3 py-2 h-32"
                  >
                    {allTasksForDependency.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}（{getStatusLabel(task.status)}）
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    按住 Ctrl/Cmd 可多选。只有依赖任务全部“已通过”后，此任务才会被调度。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddTask(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={createTask}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 任务详情弹窗 */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-screen overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold">{selectedTask.title}</h2>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">状态:</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${getStatusColor(selectedTask.status)}`}>
                    {getStatusLabel(selectedTask.status)}
                  </span>
                </div>
                <div>
                  <span className="font-medium">优先级:</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${getPriorityColor(selectedTask.priority)}`}>
                    {getPriorityLabel(selectedTask.priority)}
                  </span>
                </div>
                <div>
                  <span className="font-medium">分配给:</span>
                  <span className="ml-2">{selectedTask.assignedTo || "未分配"}</span>
                </div>
                <div>
                  <span className="font-medium">创建者:</span>
                  <span className="ml-2">{selectedTask.createdBy}</span>
                </div>
              </div>

              {selectedTask.assignedTo && !["in_progress", "submitted"].includes(selectedTask.status) && (
                <div className="rounded border border-blue-200 bg-blue-50 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => redispatchTask(selectedTask)}
                      disabled={redispatchingTaskId === selectedTask.id}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                      {redispatchingTaskId === selectedTask.id ? "重新下发中..." : "重新下发"}
                    </button>
                    {redispatchMessage && redispatchMessageTaskId === selectedTask.id && (
                      <span className={`text-xs ${redispatchMessage.includes("失败") || redispatchMessage.includes("无法") ? "text-red-600" : "text-green-600"}`}>
                        {redispatchMessage}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-medium mb-1">依赖任务</h3>
                {selectedTask.dependsOnTaskIds && selectedTask.dependsOnTaskIds.length > 0 ? (
                  <div className="space-y-1">
                    {selectedTask.dependsOnTaskIds.map((depId) => {
                      const depTask = taskMap.get(depId);
                      const depStatus = depTask?.status || "missing";
                      return (
                        <div key={depId} className="text-sm text-gray-700 flex items-center gap-2">
                          <span>{depTask?.title || depId}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(depStatus)}`}>
                            {getStatusLabel(depStatus)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">无依赖任务</p>
                )}
              </div>

              {(selectedTask.status === "pending" || selectedTask.status === "assigned" || selectedTask.status === "blocked") && (
                <div className="border rounded p-3">
                  <h3 className="font-medium mb-2">编辑依赖</h3>
                  <select
                    multiple
                    value={dependencyDraft}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions).map((option) => option.value);
                      setDependencyDraft(values);
                      setDependencyMessage(null);
                    }}
                    className="w-full border rounded-lg px-3 py-2 h-32"
                  >
                    {allTasksForDependency
                      .filter((task) => task.id !== selectedTask.id)
                      .map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}（{getStatusLabel(task.status)}）
                        </option>
                      ))}
                  </select>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={saveDependencies}
                      disabled={dependencySaving}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                      {dependencySaving ? "保存中..." : "保存依赖"}
                    </button>
                    {dependencyMessage && (
                      <span className={`text-xs ${dependencyMessage.includes("失败") || dependencyMessage.includes("error") ? "text-red-600" : "text-green-600"}`}>
                        {dependencyMessage}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {selectedTask.status === "blocked" && selectedTask.blockedReason && (
                <div className="rounded bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
                  当前阻塞原因: {selectedTask.blockedReason}
                </div>
              )}

              <div>
                <h3 className="font-medium mb-1">描述</h3>
                <p className="text-gray-600 text-sm whitespace-pre-wrap">{selectedTask.description}</p>
              </div>

              {selectedTask.result && (
                <div>
                  <h3 className="font-medium mb-1">执行结果</h3>
                  <p className="text-gray-600 text-sm whitespace-pre-wrap">{selectedTask.result}</p>
                </div>
              )}

              {selectedTask.reviewComment && (
                <div>
                  <h3 className="font-medium mb-1">审查意见</h3>
                  <p className="text-gray-600 text-sm">{selectedTask.reviewComment}</p>
                  {selectedTask.reviewScore && (
                    <p className="text-sm mt-1">评分: {selectedTask.reviewScore}/5</p>
                  )}
                </div>
              )}

              {/* Boss审查区域 */}
              {selectedTask.status === "submitted" && (
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">审查任务</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm mb-1">审查结果</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setReviewForm({ ...reviewForm, approved: true })}
                          className={`px-4 py-2 rounded ${
                            reviewForm.approved
                              ? "bg-green-600 text-white"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          ✓ 通过
                        </button>
                        <button
                          onClick={() => setReviewForm({ ...reviewForm, approved: false })}
                          className={`px-4 py-2 rounded ${
                            !reviewForm.approved
                              ? "bg-red-600 text-white"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          ✕ 驳回
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm mb-1">评分 (1-5)</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={reviewForm.score}
                        onChange={(e) => setReviewForm({ ...reviewForm, score: parseInt(e.target.value) })}
                        className="border rounded px-3 py-2 w-20"
                      />
                    </div>

                    <div>
                      <label className="block text-sm mb-1">审查意见</label>
                      <textarea
                        value={reviewForm.comment}
                        onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                        className="w-full border rounded px-3 py-2 h-24"
                        placeholder="请填写审查意见..."
                      />
                    </div>

                    {!reviewForm.approved && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={reviewForm.createFollowUp}
                            onChange={(e) =>
                              setReviewForm({ ...reviewForm, createFollowUp: e.target.checked })
                            }
                          />
                          <span className="text-sm">创建后续任务要求重新完成</span>
                        </label>

                        {reviewForm.createFollowUp && (
                          <>
                            <input
                              type="text"
                              placeholder="后续任务标题"
                              value={reviewForm.followUpTitle}
                              onChange={(e) =>
                                setReviewForm({ ...reviewForm, followUpTitle: e.target.value })
                              }
                              className="w-full border rounded px-3 py-2"
                            />
                            <textarea
                              placeholder="后续任务描述"
                              value={reviewForm.followUpDescription}
                              onChange={(e) =>
                                setReviewForm({ ...reviewForm, followUpDescription: e.target.value })
                              }
                              className="w-full border rounded px-3 py-2 h-24"
                            />
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedTask(null)}
                        className="px-4 py-2 border rounded hover:bg-gray-50"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => reviewTask(selectedTask.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        提交审查
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
