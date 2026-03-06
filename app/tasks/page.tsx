"use client";

import { useState, useEffect, useMemo } from "react";
import type { Task } from "../../lib/task-types";

interface SystemConfigData {
  availableAgents?: string[];
  agentDisplayNameMap?: Record<string, string>;
}

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
        setTasks(filteredData.tasks);
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
      pending: "bg-gray-100 text-gray-800",
      assigned: "bg-blue-100 text-blue-800",
      in_progress: "bg-yellow-100 text-yellow-800",
      submitted: "bg-purple-100 text-purple-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      blocked: "bg-orange-100 text-orange-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-gray-200 text-gray-700",
      medium: "bg-blue-200 text-blue-700",
      high: "bg-orange-200 text-orange-700",
      urgent: "bg-red-200 text-red-700",
    };
    return colors[priority] || "bg-gray-200 text-gray-700";
  };

  const taskMap = useMemo(() => {
    return new Map(allTasksForDependency.map((task) => [task.id, task]));
  }, [allTasksForDependency]);

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
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
            className={`px-3 py-1 rounded ${
              filter === status
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {status === "all" ? "全部" : status}
          </button>
        ))}
      </div>

      {/* 任务列表 */}
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          当前筛选下暂无任务
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-left transition-all hover:border-[var(--accent)]/50 hover:shadow-lg"
              onClick={() => setSelectedTask(task)}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
                  {task.title}
                </h3>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${getPriorityColor(task.priority)}`}>
                  {task.priority}
                </span>
              </div>

              <p className="mt-1 h-8 overflow-hidden text-xs leading-4 text-[var(--text-muted)]">
                {task.description || "无描述"}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[11px] ${getStatusColor(task.status)}`}>
                  {task.status}
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
          ))}
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
                        {task.title} ({task.status})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    按住 Ctrl/Cmd 可多选。只有依赖任务全部 approved 后，此任务才会被调度。
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
                    {selectedTask.status}
                  </span>
                </div>
                <div>
                  <span className="font-medium">优先级:</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${getPriorityColor(selectedTask.priority)}`}>
                    {selectedTask.priority}
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
                            {depStatus}
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
                          {task.title} ({task.status})
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
