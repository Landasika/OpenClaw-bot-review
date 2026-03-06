# 任务自动调度器使用指南

## 🎯 功能概述

任务自动调度器是一个**后台服务**，会定期（每1分钟）自动检查和调度待执行的任务。

### 核心功能
- ✅ **自动检查**：每 1 分钟检查一次 `assigned` 状态的任务
- ✅ **智能调度**：检查 Agent 状态，等待空闲后自动执行
- ✅ **并发控制**：最多同时调度 3 个任务
- ✅ **失败重试**：支持自动重试失败的调度
- ✅ **前端控制**：提供 Web 界面控制调度器启停

---

## 🚀 快速开始

### 方式 1：Web 界面控制（推荐）

1. 访问任务管理页面：`http://192.168.171.153:3000/tasks`

2. 在页面顶部找到 **"📋 任务调度器"** 控制面板

3. 点击 **"▶️ 启动调度器"** 按钮启动

4. 调度器会自动：
   - 每分钟检查待调度任务
   - 自动调度 `assigned` 状态的任务
   - 显示调度统计信息

### 方式 2：API 控制

```bash
# 启动调度器
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

# 停止调度器
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'

# 立即检查（手动触发）
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger"}'

# 重启调度器
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "restart"}'

# 查看状态
curl http://localhost:3000/api/task-scheduler
```

---

## 📊 控制面板说明

### 状态指示

```
🟢 运行中 (动画)  - 调度器正在运行
⚫ 已停止         - 调度器已停止
```

### 统计信息

| 项目 | 说明 |
|------|------|
| 状态 | 运行中 / 已停止 |
| 已调度任务 | 总共成功调度的任务数 |
| 最后调度 | 最近一次调度的时间 |
| 错误次数 | 调度失败的次数 |

### 控制按钮

| 按钮 | 功能 | 何时可用 |
|------|------|----------|
| ▶️ 启动调度器 | 启动调度器 | 调度器停止时 |
| ⏸️ 停止 | 停止调度器 | 调度器运行时 |
| 🔄 立即检查 | 立即执行一次检查 | 调度器运行时 |
| 🔄 重启 | 重启调度器 | 始终可用 |

---

## 🔄 工作流程

```
┌─────────────────────────────────────────────────────┐
│              任务自动调度流程                         │
└─────────────────────────────────────────────────────┘

1️⃣ 定期检查（每 1 分钟）
   ↓
2️⃣ 获取 assigned 状态的任务
   ↓
3️⃣ 检查 Agent 状态
   ├─ Agent 空闲 → 立即调度 ✅
   ├─ Agent 忙碌 → 跳过（等待下次检查）⏳
   └─ Agent 离线 → 跳过（等待下次检查）⏸️
   ↓
4️⃣ 调度任务（最多 3 个并发）
   ├─ 调用 openclaw agent 命令
   ├─ 更新任务状态：assigned → in_progress
   └─ 等待执行完成
   ↓
5️⃣ 任务完成
   in_progress → submitted
   ↓
6️⃣ 等待 Boss 审查
```

---

## ⚙️ 配置选项

编辑 `lib/task-scheduler-service.ts` 修改配置：

```typescript
const SCHEDULER_CONFIG = {
  enabled: true,                  // 是否启用（默认 true）
  checkInterval: 60 * 1000,       // 检查间隔：1 分钟
  maxConcurrent: 3,               // 最多同时调度 3 个任务
  maxRetries: 3,                  // 失败重试次数
  retryDelay: 5 * 60 * 1000,      // 重试间隔：5 分钟
};
```

### 常用配置

```typescript
// 快速调度（30 秒检查一次）
checkInterval: 30 * 1000,  // 30 秒

// 高并发（最多 5 个任务）
maxConcurrent: 5,

// 激进重试（最多 10 次）
maxRetries: 10,

// 环境变量控制
enabled: process.env.AUTO_DISPATCH_ENABLED !== 'false',
```

---

## 📈 使用场景

### 场景 1：日常任务管理

```bash
# 1. 启动调度器
访问 http://192.168.171.153:3000/tasks
点击 "▶️ 启动调度器"

# 2. 创建任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "搜索今日新闻",
    "description": "搜索并总结今日重要新闻",
    "assignedTo": "niuma-searcher"
  }'

# 3. 等待自动调度（最多 1 分钟）
# 调度器会自动检测并调度任务
```

### 场景 2：批量创建任务

```bash
# 创建多个任务
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/tasks \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"任务 $i\",
      \"description\": \"批量创建的任务 $i\",
      \"assignedTo\": \"niuma-searcher\"
    }"
done

# 调度器会自动逐个调度（最多 3 个并发）
```

### 场景 3：手动触发检查

```bash
# 立即检查并调度待执行任务
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger"}'

# 或在 Web 界面点击 "🔄 立即检查" 按钮
```

---

## 🐛 故障排查

### 问题 1：调度器没有自动启动

**原因**：可能没有在应用启动时自动启动

**解决**：
```bash
# 方法 1：在 Web 界面手动启动
访问 http://192.168.171.153:3000/tasks
点击 "▶️ 启动调度器"

# 方法 2：通过 API 启动
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

# 方法 3：检查环境变量
echo $AUTO_DISPATCH_ENABLED
# 应该为空或 "true"
```

### 问题 2：任务一直处于 assigned 状态

**原因**：
1. 调度器未启动
2. Agent 离线
3. 检查间隔太长

**解决**：
```bash
# 1. 检查调度器状态
curl http://localhost:3000/api/task-scheduler

# 2. 检查 Agent 状态
curl http://localhost:3000/api/agent-activity

# 3. 手动触发检查
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger"}'
```

### 问题 3：调度器显示错误

**原因**：调度任务时遇到异常

**解决**：
```bash
# 查看错误信息
curl http://localhost:3000/api/task-scheduler | jq '.scheduler.lastError'

# 常见错误：
# - "Agent xxx is offline" → Agent 离线，等待上线
# - "Task xxx not found" → 任务已被删除，忽略
# - "Timeout" → 任务执行超时，检查 Agent 性能
```

---

## 📊 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/task-scheduler` | GET | 获取调度器状态 |
| `/api/task-scheduler` | POST | 控制调度器（start/stop/trigger/restart） |

### 请求示例

```bash
# GET /api/task-scheduler
curl http://localhost:3000/api/task-scheduler

# 响应：
{
  "success": true,
  "scheduler": {
    "enabled": true,
    "running": true,
    "dispatchCount": 15,
    "lastDispatchTime": 1772700000000,
    "lastDispatchTimeFormatted": "2026-03-05 17:00:00",
    "errorCount": 2,
    "lastError": ""
  }
}

# POST /api/task-scheduler
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

# 响应：
{
  "success": true,
  "message": "调度器已启动",
  "scheduler": { ... }
}
```

---

## 🎉 总结

现在您可以：

1. ✅ **自动调度任务**：无需手动调用 dispatch API
2. ✅ **Web 界面控制**：启动/停止/触发调度器
3. ✅ **实时状态监控**：查看调度统计和错误信息
4. ✅ **智能并发控制**：避免同时调度过多任务
5. ✅ **Agent 状态检测**：等待 Agent 空闲后再调度

**开始使用**：
1. 访问 `http://192.168.171.153:3000/tasks`
2. 点击 "▶️ 启动调度器"
3. 创建任务，系统自动调度！

祝使用愉快！🚀
