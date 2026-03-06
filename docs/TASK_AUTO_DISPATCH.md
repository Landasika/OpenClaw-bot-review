# 任务自动调度功能使用指南

## 🚀 新功能概述

任务管理系统现在支持通过 `openclaw agent` 命令自动调度员工执行任务！

**核心特性**：
- ✅ 自动调用 `openclaw agent --agent <员工ID> --message "任务内容"`
- ✅ 实时跟踪任务执行状态
- ✅ 自动获取执行结果并提交到任务管理系统
- ✅ 支持单个任务调度和批量自动调度

---

## 📋 工作流程

### 传统方式 vs 自动调度

**传统方式**：
```
Boss创建任务 → 手动告诉员工 → 员工手动执行 → 员工手动提交结果
```

**自动调度方式**：
```
Boss创建任务 → 系统自动调度 → Agent自动执行 → 系统自动提交结果 → Boss审查
```

### 调度流程图

```
┌──────────────────────────────────────────────────────────────┐
│                    自动调度流程                               │
└──────────────────────────────────────────────────────────────┘

1. 📝 Boss 创建任务
   ↓
2. 👥 分配给员工 (niuma-searcher / niuma-osadmin)
   ↓
3. 🤖 系统自动执行:
   openclaw agent --agent niuma-searcher --message "任务内容"
   ↓
4. 🔄 任务状态自动更新:
   assigned → in_progress → submitted
   ↓
5. 👀 Boss 审查结果
   ↓
6. ✅ 通过 / ❌ 驳回
```

---

## 🎯 使用方式

### 方式1: Web界面手动调度

#### 单个任务调度

1. 访问 `http://192.168.171.153:3000/tasks`
2. 找到状态为 `assigned` 的任务
3. 点击任务卡片查看详情
4. 点击 **"🚀 立即调度"** 按钮
5. 系统自动调用 openclaw agent 命令
6. 任务状态自动更新为 `in_progress`
7. 执行完成后自动更新为 `submitted`

#### 批量自动调度

1. 在任务列表页面
2. 点击顶部 **"🚀 自动调度全部"** 按钮
3. 系统自动调度所有 `assigned` 状态的任务（最多10个）
4. 显示调度进度和结果

### 方式2: API调度

#### 创建任务时自动调度

```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "搜索最新的AI技术趋势",
    "description": "搜索并总结2024年最热门的AI技术方向",
    "priority": "high",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'
```

**响应**：
```json
{
  "success": true,
  "task": {...},
  "dispatched": true,
  "message": "任务已创建并自动调度执行"
}
```

#### 手动调度已创建的任务

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_xxx"
  }'
```

#### 批量自动调度

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "autoDispatch": true,
    "limit": 5
  }'
```

**响应**：
```json
{
  "success": true,
  "dispatched": 3,
  "results": [
    {
      "success": true,
      "taskId": "task_xxx",
      "agentId": "niuma-searcher",
      "duration": 15000,
      "response": "..."
    }
  ]
}
```

### 方式3: 定时自动调度

使用 cron 定期调度待执行的任务：

```bash
# 每5分钟自动调度一次
*/5 * * * * curl -X POST http://192.168.171.153:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch": true, "limit": 3}'
```

---

## 🔧 技术细节

### 调度命令格式

系统内部执行：

```bash
openclaw agent --agent <员工ID> --message "【任务执行】

任务: <任务标题>

<任务描述>

请执行此任务并返回结果。" --json
```

**示例**：
```bash
openclaw agent --agent niuma-searcher \
  --message "【任务执行】

任务: 搜索最新的AI技术趋势

搜索并总结2024年最热门的AI技术方向

请执行此任务并返回结果。" \
  --json
```

### 响应解析

系统会解析 `openclaw agent` 命令的JSON输出：

```json
{
  "runId": "xxx",
  "status": "ok",
  "summary": "completed",
  "result": {
    "payloads": [
      {
        "text": "2024年最热门的AI技术包括：\n1. 大语言模型(LLM)\n2. 多模态AI\n3. ..."
      }
    ]
  }
}
```

提取 `result.payloads[0].text` 作为任务结果。

### 超时设置

- 单个任务超时：**10分钟**
- 超时后任务状态会标记为失败
- 错误信息会记录在任务结果中

---

## 📊 使用场景

### 场景1: 研究任务

```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "调研微服务架构最佳实践",
    "description": "搜索并总结微服务架构的设计原则、常见问题和解决方案",
    "priority": "medium",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true,
    "estimatedHours": 2
  }'
```

**执行**：
1. 系统自动调用 `openclaw agent --agent niuma-searcher ...`
2. niuma-searcher 执行搜索和总结
3. 结果自动提交到任务
4. Boss 审查结果

### 场景2: 系统运维任务

```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "检查服务器磁盘使用情况",
    "description": "检查所有服务器的磁盘使用率，找出超过80%的服务器",
    "priority": "high",
    "assignedTo": "niuma-osadmin",
    "autoDispatch": true
  }'
```

**执行**：
1. 系统自动调用 `openclaw agent --agent niuma-osadmin ...`
2. niuma-osadmin 执行检查命令
3. 结果自动提交
4. Boss 审查并决定是否需要清理

### 场景3: 批量数据处理

创建多个相关任务，批量调度：

```bash
# 创建任务1
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "处理Q1数据","assignedTo":"niuma-searcher","autoDispatch":false}'

# 创建任务2
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "处理Q2数据","assignedTo":"niuma-searcher","autoDispatch":false}'

# 创建任务3
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "处理Q3数据","assignedTo":"niuma-searcher","autoDispatch":false}'

# 批量调度所有任务
curl -X POST http://192.168.171.153:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch":true,"limit":5}'
```

---

## ⚙️ 高级配置

### 调度超时配置

编辑 `lib/task-scheduler.ts`：

```typescript
const { stdout, stderr } = await execFileAsync(
  "openclaw",
  ["agent", "--agent", agentId, "--message", message, "--json"],
  {
    timeout: 600000, // 修改这里的超时时间（毫秒）
    // 10分钟 = 600000
    // 30分钟 = 1800000
  }
);
```

### 并发控制

默认串行执行任务，间隔1秒。修改并发逻辑：

```typescript
// 在 dispatchMultipleTasks 函数中
// 当前：串行执行
for (const task of tasks) {
  await dispatchTaskToAgent(...);
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// 改为：并行执行（最多3个并发）
const chunks = [];
for (let i = 0; i < tasks.length; i += 3) {
  chunks.push(tasks.slice(i, i + 3));
}

for (const chunk of chunks) {
  await Promise.all(
    chunk.map(task => dispatchTaskToAgent(...))
  );
}
```

### Agent可用性检查

在调度前检查Agent是否可用：

```typescript
import { checkAgentAvailable } from "@/lib/task-scheduler";

const available = await checkAgentAvailable("niuma-searcher");
if (!available) {
  console.error("Agent 不可用");
  return;
}
```

---

## 🐛 故障排查

### 问题1: 调度失败 - "Agent not available"

**原因**：Agent进程未运行或配置错误

**解决**：
```bash
# 检查Agent状态
openclaw agents list

# 检查Gateway状态
curl http://localhost:18789/health

# 重启Gateway
openclaw daemon restart
```

### 问题2: 任务超时

**原因**：任务执行时间超过10分钟

**解决**：
1. 增加超时时间（见上方配置）
2. 将大任务拆分为小任务
3. 检查Agent性能

### 问题3: 结果解析失败

**原因**：Agent返回的不是有效JSON

**解决**：
- 系统会自动回退到原始文本输出
- 检查Agent的输出格式
- 查看 `/root/.openclaw/agents/<agentId>/sessions/` 中的日志

### 问题4: 任务卡在 in_progress 状态

**原因**：调度进程异常终止

**解决**：
```bash
# 手动更新任务状态
curl -X PATCH http://192.168.171.153:3000/api/tasks/task_xxx \
  -H "Content-Type: application/json" \
  -d '{"status": "submitted", "result": "手动提交的结果"}'
```

---

## 📈 性能优化

### 1. 使用队列

对于大量任务，使用消息队列（如Redis）：

```typescript
// 添加任务到队列
await redis.lpush("task:queue", JSON.stringify(taskId));

// Worker处理队列
while (true) {
  const taskId = await redis.brpop("task:queue", 0);
  await dispatchTaskToAgent(...);
}
```

### 2. 缓存Agent状态

```typescript
const agentStatusCache = new Map();

async function checkAgentAvailable(agentId: string) {
  if (agentStatusCache.has(agentId)) {
    return agentStatusCache.get(agentId);
  }
  const available = await actualCheck(agentId);
  agentStatusCache.set(agentId, available);
  setTimeout(() => agentStatusCache.delete(agentId), 60000); // 1分钟缓存
  return available;
}
```

---

## 🔐 安全注意事项

1. **权限控制**：确保只有授权用户可以调用调度API
2. **命令注入**：任务描述已做处理，但仍需注意
3. **资源限制**：限制并发调度数量，避免系统过载
4. **日志审计**：所有调度操作都记录日志

---

## 📚 API 端点总结

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/tasks` | POST | 创建任务（设置 `autoDispatch: true` 自动调度）|
| `/api/tasks/dispatch` | POST | 调度单个任务或批量调度 |
| `/api/tasks/dispatch` | GET | 查看待调度任务统计 |

---

## 🎉 总结

现在你可以：

1. ✅ 创建任务时选择 `autoDispatch: true` 自动执行
2. ✅ 在Web界面点击按钮手动调度
3. ✅ 批量自动调度所有待执行任务
4. ✅ 设置定时任务自动调度
5. ✅ 系统自动调用 `openclaw agent` 命令
6. ✅ 自动获取结果并更新任务状态

**开始使用**：
```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试自动调度",
    "description": "这是一个测试任务",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'
```

祝使用愉快！🚀
