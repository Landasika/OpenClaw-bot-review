# 飞书通知

本文只讲飞书通知的配置、事件映射和排障。任务流程见 [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)。

## 1. 配置来源

配置文件：`data/system-config.json`

关键字段：

- `notificationEnabled`
- `feishuNotificationEnabled`
- `feishuDefaultChatId`
- `feishuBotScriptPath`
- `feishuBotMap`（agent -> bot key）
- `feishuBots`（bot key -> `name/appId/appSecret`）

示例结构：

```json
{
  "notificationEnabled": true,
  "feishuNotificationEnabled": true,
  "feishuDefaultChatId": "oc_xxx",
  "feishuBotScriptPath": "scripts/feishu_bot_send.py",
  "feishuBotMap": {
    "main": "boss",
    "niuma-searcher": "searcher"
  },
  "feishuBots": {
    "boss": { "name": "牛马-Boss", "appId": "cli_xxx", "appSecret": "xxx" },
    "searcher": { "name": "牛马-Searcher", "appId": "cli_xxx", "appSecret": "xxx" }
  }
}
```

## 2. 事件映射（不重复流程）

- 任务分配：`notifyTaskAssigned`
- 员工开始执行：`notifyTaskAccepted`
- 员工执行完成：`notifyTaskCompleted`
- 审查通过：`notifyTaskApproved`
- 审查驳回：`notifyTaskRejected`
- 创建改进任务：`notifyImprovementTaskCreated`
- 任务排队：`notifyTaskQueued`
- Agent 离线：`notifyAgentOffline`
- Agent 空闲恢复：`notifyAgentReady`
- 调度失败：`notifyTaskDispatchFailed`

实现位置：`lib/feishu-notifier.ts`

## 3. 发送链路

1. 业务代码触发通知函数。
2. 通知模块解析 bot key 与 chat id。
3. 调用 `python3 <feishuBotScriptPath> --bot ... --chat ... --message ...`。
4. 根据脚本输出判断是否成功。

## 4. 快速自检

```bash
# 1) 看系统配置
curl -s "http://localhost:3000/api/system-config" | jq '.config | {notificationEnabled,feishuNotificationEnabled,feishuDefaultChatId,feishuBotMap,feishuBots}'

# 2) 直接测试脚本（按你的 bot/chat 替换）
python3 scripts/feishu_bot_send.py --bot boss --chat oc_xxx --message "通知链路测试"

# 3) 运行现有集成脚本
bash scripts/test-feishu-notifications.sh
```

## 5. 常见问题

- 无消息：`notificationEnabled` 或 `feishuNotificationEnabled` 为 `false`。
- 报 bot 不存在：`feishuBotMap` 映射到的 key 未出现在 `feishuBots`。
- 鉴权失败：`appId/appSecret` 错误或过期。
- 发送脚本路径错误：检查 `feishuBotScriptPath` 是否存在。

## 6. 最小上线清单

- 填好 `feishuDefaultChatId`
- 至少配置 `boss` bot
- 对每个执行 Agent 补好 `feishuBotMap`
- 用 `scripts/test-feishu-notifications.sh` 跑一次冒烟

## 7. 相关文档

- 生命周期： [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)
- API： [API_REFERENCE.md](./API_REFERENCE.md)
- 自动审查： [BOSS_AUTO_REVIEW.md](./BOSS_AUTO_REVIEW.md)
