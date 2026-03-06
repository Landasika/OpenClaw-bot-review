# API 参考（任务系统）

本文只描述任务系统 API 的请求参数、状态约束和常用示例。

- 基础地址：`http://localhost:3000`
- 返回结构：大多数接口统一返回 `success: boolean`

## 1. 任务列表与创建

### GET `/api/tasks`

查询参数：

- `status`: `pending|assigned|blocked|in_progress|submitted|approved|rejected|cancelled`
- `assignedTo`: 按执行人过滤
- `createdBy`: 按创建人过滤
- `dependsOnTaskId`: 查询依赖了某任务的任务
- `limit`: 限制返回条数

示例：

```bash
curl -s "http://localhost:3000/api/tasks?status=assigned&limit=10" | jq .
```

### POST `/api/tasks`

用途：创建任务，可选自动调度。

关键字段：

- `title` (required)
- `description` (required)
- `assignedTo` (optional)
- `priority` (optional): `low|medium|high|urgent`
- `dependsOnTaskIds` (optional): 依赖任务 ID 数组
- `autoDispatch` (optional): `true` 时创建后立即调度（仅当状态为 `assigned`）

状态规则：

- 未分配：`pending`
- 已分配且依赖满足：`assigned`
- 已分配但依赖未满足：`blocked`

示例：

```bash
curl -s -X POST "http://localhost:3000/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "调研 API 网关限流策略",
    "description": "输出可落地限流方案和阈值建议",
    "assignedTo": "niuma-searcher",
    "dependsOnTaskIds": [],
    "autoDispatch": true
  }' | jq .
```

## 2. 分配与调度

### POST `/api/tasks/assign`

用途：把任务分配给员工。

请求体：

- `taskId` (required)
- `assignedTo` (required)

行为：

- 自动根据依赖关系决定状态为 `assigned` 或 `blocked`

```bash
curl -s -X POST "http://localhost:3000/api/tasks/assign" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"task_xxx","assignedTo":"niuma-coder"}' | jq .
```

### POST `/api/tasks/dispatch`

用途：手动调度一个任务，或批量自动调度。

模式 A：单任务调度

- `taskId` (required)
- `waitForIdle` (optional, default `true`)
- `maxWait` (optional, 毫秒)
- `checkInterval` (optional, 毫秒)

约束：

- 任务必须为 `assigned`（`blocked` 会先尝试依赖校验后解锁）

```bash
curl -s -X POST "http://localhost:3000/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_xxx",
    "waitForIdle": true,
    "maxWait": 1800000,
    "checkInterval": 30000
  }' | jq .
```

模式 B：批量自动调度

- `autoDispatch`: `true`
- `limit`: 本次最多调度数量（可选，默认 5）

```bash
curl -s -X POST "http://localhost:3000/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch":true,"limit":5}' | jq .
```

### GET `/api/tasks/dispatch`

用途：查看当前待调度统计。

```bash
curl -s "http://localhost:3000/api/tasks/dispatch" | jq .
```

## 3. 提交结果与审查

### POST `/api/tasks/{id}/result`

用途：员工提交执行结果。

请求体：

- `result` (required)
- `attachments` (optional)
- `actualHours` (optional)

状态约束：

- 仅允许 `assigned` / `in_progress` -> `submitted`

```bash
curl -s -X POST "http://localhost:3000/api/tasks/task_xxx/result" \
  -H "Content-Type: application/json" \
  -d '{"result":"执行完成，见结论与数据表"}' | jq .
```

### POST `/api/tasks/{id}/review`

用途：Boss 手动审查。

请求体：

- `approved` (required, boolean)
- `comment` (optional)
- `score` (optional，自动归一到 1-5)
- `createFollowUpTask` (optional)
- `followUpTaskTitle` (optional)
- `followUpTaskDescription` (optional)

状态约束：

- 仅允许 `submitted` -> `approved` / `rejected`

```bash
curl -s -X POST "http://localhost:3000/api/tasks/task_xxx/review" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "score": 2,
    "comment": "数据不完整，请补充基线对比",
    "createFollowUpTask": true
  }' | jq .
```

## 4. 调度器 / 审查器控制

### GET `/api/task-scheduler`

查看调度器（scheduler）和审查器（reviewer）状态。

```bash
curl -s "http://localhost:3000/api/task-scheduler" | jq .
```

### POST `/api/task-scheduler`

用途：控制 scheduler / reviewer。

请求体：

- `service`: `scheduler` | `reviewer`
- `action`: `start` | `stop` | `trigger` | `restart`

```bash
# 启动调度器
curl -s -X POST "http://localhost:3000/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"service":"scheduler","action":"start"}' | jq .

# 手动触发审查器
curl -s -X POST "http://localhost:3000/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"service":"reviewer","action":"trigger"}' | jq .
```

## 5. Agent 活跃状态

### GET `/api/agent-activity`

用途：查看 Agent `idle/working/offline` 状态，辅助调度等待逻辑。

```bash
curl -s "http://localhost:3000/api/agent-activity" | jq '.agents[] | {agentId,state,idle}'
```

## 6. 常见错误码

- `400`: 参数缺失或状态不允许（如非 `assigned` 却请求调度）
- `404`: 任务不存在
- `500`: 服务端异常

## 7. 相关文档

- [任务生命周期](./TASK_LIFECYCLE.md)
- [任务自动调度](./TASK_AUTO_DISPATCH.md)
- [Agent 空闲等待](./AGENT_IDLE_WAIT.md)
- [Boss 自动审查](./BOSS_AUTO_REVIEW.md)
- [飞书通知](./FEISHU_NOTIFICATIONS.md)
