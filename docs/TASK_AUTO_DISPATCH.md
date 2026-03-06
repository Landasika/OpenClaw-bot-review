# 任务自动调度

本文仅覆盖“如何把 `assigned` 任务调度给 Agent 执行”。生命周期主线见 [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)，接口字段详表见 [API_REFERENCE.md](./API_REFERENCE.md)。

## 1. 调度方式

- 创建任务时自动调度：`POST /api/tasks` + `autoDispatch: true`
- 手动调度单任务：`POST /api/tasks/dispatch` + `taskId`
- 批量自动调度：`POST /api/tasks/dispatch` + `autoDispatch: true`
- 周期自动调度：由 scheduler 定时执行

## 2. 调度前置条件

- 任务必须有 `assignedTo`。
- 任务状态需可执行：
  - `assigned` 可直接调度
  - `blocked` 仅在依赖满足后才会先转 `assigned` 再调度
- 目标 Agent 需在线；否则任务会失败并可能标记为 `cancelled`。

## 3. 调度执行过程

1. 读取任务详情。
2. 检查 Agent 状态（`idle/working/offline`）。
3. 若 `working` 且允许等待，则进入排队等待（详见 [AGENT_IDLE_WAIT.md](./AGENT_IDLE_WAIT.md)）。
4. 更新任务为 `in_progress`。
5. 执行 `openclaw agent --agent <agentId> --message ... --json`。
6. 解析输出并写入任务结果，状态改为 `submitted`。
7. 发送对应飞书通知。

## 4. 常用调用

### 4.1 创建后立即调度

```bash
curl -s -X POST "http://localhost:3000/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "检查 API 错误率异常",
    "description": "定位 5xx 峰值时段与根因",
    "assignedTo": "niuma-osadmin",
    "autoDispatch": true
  }' | jq .
```

### 4.2 手动调度一个任务

```bash
curl -s -X POST "http://localhost:3000/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"task_xxx"}' | jq .
```

### 4.3 批量调度

```bash
curl -s -X POST "http://localhost:3000/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch":true,"limit":5}' | jq .
```

## 5. 性能与稳定性参数

来源：`data/system-config.json`

- `taskDispatchEnabled`: 开关
- `taskDispatchIntervalSeconds`: 调度扫描间隔
- `taskDispatchMaxConcurrent`: 每轮最多调度数
- `taskDispatchMaxRetries` / `taskDispatchRetryDelaySeconds`: 重试参数
- `taskDispatchWaitForIdleMaxSeconds`: 等待空闲上限
- `taskDispatchWaitCheckIntervalSeconds`: 空闲检测间隔

## 6. 失败场景与处理

- Agent 离线：调度失败，建议改派或等待恢复。
- 执行超时：任务可能变 `cancelled`，需重试或拆分任务。
- 依赖未满足：任务会回写 `blocked`，先处理前置任务。
- 输出解析失败：检查 openclaw 返回格式与 stderr。

## 7. 快速排障命令

```bash
# 调度器状态
curl -s "http://localhost:3000/api/task-scheduler" | jq .

# 待调度统计
curl -s "http://localhost:3000/api/tasks/dispatch" | jq .

# 当前任务状态分布
curl -s "http://localhost:3000/api/tasks?limit=200" | jq '[.tasks[].status] | group_by(.) | map({status: .[0], count: length})'
```

## 8. 相关文档

- 生命周期： [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)
- API： [API_REFERENCE.md](./API_REFERENCE.md)
- 空闲等待： [AGENT_IDLE_WAIT.md](./AGENT_IDLE_WAIT.md)
- 日志： [LOG_OUTPUT.md](./LOG_OUTPUT.md)
