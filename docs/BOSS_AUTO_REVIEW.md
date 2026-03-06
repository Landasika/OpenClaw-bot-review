# Boss 自动审查

本文只讲审查器（reviewer）如何自动处理 `submitted` 任务，不重复调度细节。

## 1. 审查器职责

- 周期扫描 `submitted` 任务。
- 根据结果内容自动打分（1-5）。
- `score >= 3` 自动通过；否则驳回。
- 发送飞书审查通知。

## 2. 审查规则（当前实现）

输入：任务 `result` 文本。

检测维度：

- `hasDetail`: 长度 > 100
- `hasData`: 包含数字
- `hasStructure`: 包含换行分段

评分：

- 三项都满足 -> 5
- 详细 + 数据 -> 4
- 仅详细 -> 3
- 其余 -> 2

结论：`score >= 3` 通过，否则驳回。

## 3. 启停与手动触发

统一入口：`/api/task-scheduler`

```bash
# 启动审查器
curl -s -X POST "http://localhost:3000/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"service":"reviewer","action":"start"}' | jq .

# 手动触发一次审查
curl -s -X POST "http://localhost:3000/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"service":"reviewer","action":"trigger"}' | jq .

# 查看状态
curl -s "http://localhost:3000/api/task-scheduler" | jq '.reviewer'
```

## 4. 手动审查接口

需要人工覆写时，用：`POST /api/tasks/{id}/review`

支持：

- `approved` / `score` / `comment`
- 可选 `createFollowUpTask` 自动生成改进任务

见 [API_REFERENCE.md](./API_REFERENCE.md)。

## 5. 配置项

`data/system-config.json`：

- `bossReviewEnabled`
- `bossReviewIntervalSeconds`
- `bossReviewMaxConcurrent`

环境变量可关闭：

- `AUTO_REVIEW_ENABLED=false`

## 6. 常见问题

- `submitted` 长期不变：审查器未启动或并发上限过低。
- 审查结果偏宽松/偏严格：调整规则逻辑（`lib/task-scheduler-extended.ts`）。
- 通知没发出：检查飞书配置和 `notificationEnabled`。

## 7. 相关文档

- 生命周期： [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)
- API： [API_REFERENCE.md](./API_REFERENCE.md)
- 飞书通知： [FEISHU_NOTIFICATIONS.md](./FEISHU_NOTIFICATIONS.md)
