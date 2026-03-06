# 调度与审查日志速查

本文用于快速定位任务系统问题，不重复业务流程说明。

## 1. 关键日志前缀

调度相关：

- `[TaskScheduler]`：调度器主循环
- `[任务调度]`：单任务调度开始
- `[Agent 状态]`：调度前状态检查
- `[任务排队]`：进入等待队列
- `[调度失败]` / `[执行失败]`：失败原因

审查相关：

- `[BossReviewer]`：审查器主循环
- `[审查检查]`：每轮扫描
- `[审查统计]`：每轮结果汇总

通知相关：

- `[Feishu]`：发送通知链路

## 2. 建议观察顺序

1. 看服务状态接口：`/api/task-scheduler`
2. 看任务状态分布：`/api/tasks`
3. 再看终端日志：调度 -> 执行 -> 审查 -> 通知

## 3. 常用排障命令

```bash
# 服务状态
curl -s "http://localhost:3000/api/task-scheduler" | jq .

# 任务分布
curl -s "http://localhost:3000/api/tasks?limit=200" | jq '[.tasks[].status] | group_by(.) | map({status: .[0], count: length})'

# 按状态查看问题任务
curl -s "http://localhost:3000/api/tasks?status=cancelled&limit=50" | jq '.tasks[] | {id,title,result,updatedAt}'
curl -s "http://localhost:3000/api/tasks?status=blocked&limit=50" | jq '.tasks[] | {id,title,blockedReason}'
```

## 4. 典型问题对照

- 大量 `blocked`：依赖未满足，先检查前置任务是否 `approved`。
- 大量 `assigned`：调度器未运行、并发过低、或 Agent 一直离线。
- 大量 `in_progress`：openclaw 执行慢或超时。
- 大量 `submitted`：审查器未运行或并发不足。
- 消息没发：重点看 `[Feishu]` 错误。

## 5. 采样建议

- 先抓最近 10 分钟问题样本，不要全量扫历史日志。
- 单次只定位一个环节（调度/执行/审查/通知），避免混看。

## 6. 相关文档

- 生命周期： [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)
- 调度： [TASK_AUTO_DISPATCH.md](./TASK_AUTO_DISPATCH.md)
- 自动审查： [BOSS_AUTO_REVIEW.md](./BOSS_AUTO_REVIEW.md)
- 飞书通知： [FEISHU_NOTIFICATIONS.md](./FEISHU_NOTIFICATIONS.md)
