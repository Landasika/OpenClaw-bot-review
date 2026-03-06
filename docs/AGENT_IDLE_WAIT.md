# Agent 空闲等待机制

本文只讲当 Agent 忙碌时，任务如何排队等待与超时退出。调度基础见 [TASK_AUTO_DISPATCH.md](./TASK_AUTO_DISPATCH.md)。

## 1. 使用场景

目标：避免“任务刚触发就因为 Agent 忙碌而失败”。

调度接口支持参数：

- `waitForIdle`：默认 `true`
- `maxWait`：最大等待毫秒数
- `checkInterval`：轮询间隔毫秒数

## 2. 状态来源

系统通过 `/api/agent-activity` 获取 Agent 状态：

- `working`: 正在执行任务
- `idle`: 可立即调度
- `offline`: 当前不可用

## 3. 等待流程

1. 调度前读取 Agent 状态。
2. `idle`：直接调度。
3. `working`：发送“任务排队中”通知并进入轮询。
4. 轮询直到：
   - 变为 `idle`：继续调度
   - 变为 `offline`：失败退出
   - 超过 `maxWait`：失败退出

失败后任务会标记为 `cancelled`，并记录失败原因。

## 4. 推荐参数

- 轻量任务：`maxWait=300000`（5 分钟），`checkInterval=10000`
- 常规任务：`maxWait=1800000`（30 分钟），`checkInterval=30000`
- 重任务队列：`maxWait=3600000`（60 分钟），`checkInterval=60000`

## 5. 调用示例

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

禁用等待（忙就直接失败）：

```bash
curl -s -X POST "http://localhost:3000/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"task_xxx","waitForIdle":false}' | jq .
```

## 6. 观测与排障

```bash
# 查看 agent 状态
curl -s "http://localhost:3000/api/agent-activity" | jq '.agents[] | {agentId,state,idle,subagents}'

# 查看任务是否进入 cancelled 并带错误信息
curl -s "http://localhost:3000/api/tasks?limit=50" | jq '.tasks[] | select(.status=="cancelled") | {id,title,result,completedAt}'
```

常见问题：

- 一直 waiting 直到超时：`checkInterval` 太大或 Agent 长期繁忙。
- 频繁 offline：先验证 openclaw 进程与网关健康。
- 等待太长影响吞吐：降低 `maxWait`，配合重试或改派。

## 7. 配置位置

全局默认值在 `data/system-config.json`：

- `taskDispatchWaitForIdleMaxSeconds`
- `taskDispatchWaitCheckIntervalSeconds`

## 8. 相关文档

- 调度： [TASK_AUTO_DISPATCH.md](./TASK_AUTO_DISPATCH.md)
- 生命周期： [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)
- API： [API_REFERENCE.md](./API_REFERENCE.md)
