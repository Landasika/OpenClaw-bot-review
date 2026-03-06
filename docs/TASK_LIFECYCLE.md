# 任务生命周期

本文只讲任务从创建到闭环的状态变化与参与方职责。接口字段和完整 `curl` 见 [API_REFERENCE.md](./API_REFERENCE.md)。

## 1. 参与方

- Boss（操作者）：创建任务、分配任务、必要时审查。
- 员工 Agent：执行任务并产出结果。
- Scheduler（调度器）：周期扫描可执行任务并调度。
- Reviewer（审查器）：周期审查 `submitted` 任务。
- Feishu 通知模块：在关键节点发群消息。

## 2. 状态机（唯一事实）

任务状态：

- `pending`
- `assigned`
- `blocked`
- `in_progress`
- `submitted`
- `approved`
- `rejected`
- `cancelled`

核心流转：

- `pending -> assigned`: 被分配且依赖满足。
- `pending -> blocked`: 被分配但依赖不满足。
- `blocked -> assigned`: 依赖满足后由调度器自动解锁。
- `assigned -> in_progress`: 调度成功开始执行。
- `assigned/in_progress -> submitted`: 员工提交结果或调度器回填结果。
- `submitted -> approved/rejected`: 手动或自动审查。
- `assigned/in_progress -> cancelled`: 调度失败、超时或 Agent 离线等异常。

## 3. 标准闭环

1. Boss 创建任务（可选直接分配）。
2. Scheduler 发现 `assigned` 且依赖满足的任务。
3. 调度前检查 Agent 状态。
4. 任务进入 `in_progress` 并触发执行。
5. 任务进入 `submitted`（附执行结果）。
6. Reviewer 或 Boss 将其变为 `approved` / `rejected`。
7. 若 `rejected` 且开启 follow-up，可自动生成改进任务。

## 4. 依赖关系（dependsOnTaskIds）

规则：只有依赖任务全部 `approved`，当前任务才允许执行。

- 创建或分配时，若依赖未满足则置为 `blocked`。
- 调度器每轮都会尝试解锁 `blocked`。
- 若 `assigned` 任务后续被发现依赖不满足，也会回写 `blocked`。

## 5. 两个自动化服务

- Scheduler：由 `taskDispatchEnabled/taskDispatchIntervalSeconds/taskDispatchMaxConcurrent` 控制。
- Reviewer：由 `bossReviewEnabled/bossReviewIntervalSeconds/bossReviewMaxConcurrent` 控制。

控制入口：`/api/task-scheduler`（见 [API_REFERENCE.md](./API_REFERENCE.md)）。

## 6. 最小操作序列

```bash
# 1) 启动 scheduler/reviewer
curl -s -X POST "http://localhost:3000/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"service":"scheduler","action":"start"}' | jq .

curl -s -X POST "http://localhost:3000/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"service":"reviewer","action":"start"}' | jq .

# 2) 创建并分配任务（可选 autoDispatch）
curl -s -X POST "http://localhost:3000/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"title":"示例任务","description":"示例描述","assignedTo":"niuma-searcher","autoDispatch":true}' | jq .

# 3) 观察生命周期
curl -s "http://localhost:3000/api/tasks?limit=20" | jq '.tasks[] | {id,status,assignedTo}'
```

## 7. 排障入口

- 任务卡在 `blocked`: 先查依赖任务是否都已 `approved`。
- 任务卡在 `assigned`: 查调度器是否运行、并发是否已满。
- 任务卡在 `in_progress`: 查 openclaw 执行是否超时/异常。
- 任务卡在 `submitted`: 查 reviewer 是否运行，或手动触发审查。

## 8. 相关文档

- 接口： [API_REFERENCE.md](./API_REFERENCE.md)
- 调度： [TASK_AUTO_DISPATCH.md](./TASK_AUTO_DISPATCH.md)
- 等待机制： [AGENT_IDLE_WAIT.md](./AGENT_IDLE_WAIT.md)
- 自动审查： [BOSS_AUTO_REVIEW.md](./BOSS_AUTO_REVIEW.md)
- 通知： [FEISHU_NOTIFICATIONS.md](./FEISHU_NOTIFICATIONS.md)
