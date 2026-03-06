# 飞书群聊通知功能使用指南

## 🎯 功能概述

任务管理系统现在支持在关键阶段通过飞书机器人群聊自动发送通知！

**支持的5个通知阶段**：
1. 📋 Boss分配任务
2. 👋 员工领取任务
3. ✅ 员工完成任务
4. 👀 Boss评估任务（通过/驳回）
5. 🔄 创建改进任务

---

## 🔧 配置说明

### 机器人配置

系统已配置3个飞书机器人：

| 机器人 | App ID | 用途 |
|--------|--------|------|
| 牛马-Boss | `cli_a92e4bdc147bdceb` | Boss发送任务分配、评估通知 |
| 牛马-Searcher | `cli_a92ff9ce0e38dcd9` | Searcher发送任务执行通知 |
| 牛马-OSAdmin | `cli_a92ef2873638dbc9` | OSAdmin发送任务执行通知 |

### 默认群聊

- **群聊ID**: `oc_721c9dd615cb420d023bbbac47c89352`

修改群聊ID：
编辑 `lib/feishu-notifier.ts`:
```typescript
const DEFAULT_CHAT_ID = "你的群聊ID";
```

---

## 📊 5个通知阶段详解

### 阶段1: 📋 Boss分配任务

**触发时机**：创建任务并分配给员工时

**发送者**：Boss机器人

**消息格式**：
```
【📋 新任务分配】

任务ID: task_xxx
标题: 搜索AI最新进展
分配给: 牛马-Searcher

描述:
搜索并总结2024年AI领域的最新技术突破

请 牛马-Searcher 查看任务并开始执行。
```

**API调用示例**：
```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type": application/json" \
  -d '{
    "title": "搜索AI最新进展",
    "description": "搜索并总结2024年AI领域的最新技术突破",
    "assignedTo": "niuma-searcher"
  }'
```

### 阶段2: 👋 员工领取任务

**触发时机**：任务开始执行时（status → in_progress）

**发送者**：对应的员工机器人

**消息格式**：
```
【👋 任务已领取】

任务ID: task_xxx
标题: 搜索AI最新进展
执行人: 牛马-Searcher

状态: 已开始执行
时间: 2026-03-05 14:30:25
```

### 阶段3: ✅ 员工完成任务

**触发时机**：任务执行完成并提交结果时（status → submitted）

**发送者**：对应的员工机器人

**消息格式**：
```
【✅ 任务已完成】

任务ID: task_xxx
标题: 搜索AI最新进展
执行人: 牛马-Searcher
耗时: 15分钟

执行结果:
2024年AI领域的主要突破包括：
1. GPT-4 Turbo发布
2. Claude 3超越GPT-4
3. 开源模型LLaMA 3表现优异
...

等待Boss审查评估。
```

### 阶段4a: 👀 Boss评估-通过

**触发时机**：Boss审查通过时（approved: true）

**发送者**：Boss机器人

**消息格式**：
```
【🎉 任务通过审查】

任务ID: task_xxx
标题: 搜索AI最新进展
执行人: 牛马-Searcher
评分: ⭐⭐⭐⭐⭐ (5/5)

审查意见:
完成得很好，总结很全面！

恭喜！任务已成功完成！
```

**API调用示例**：
```bash
curl -X POST http://192.168.171.153:3000/api/tasks/task_xxx/review \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "score": 5,
    "comment": "完成得很好，总结很全面！"
  }'
```

### 阶段4b: 👀 Boss评估-驳回

**触发时机**：Boss审查驳回时（approved: false）

**发送者**：Boss机器人

**消息格式**：
```
【🔴 任务需改进】

任务ID: task_xxx
标题: 搜索AI最新进展
执行人: 牛马-Searcher
评分: ⭐⭐⭐ (3/5)

审查意见:
缺少具体的技术细节和应用案例，需要补充

改进任务ID: task_yyy
请根据审查意见完成改进任务。

时间: 2026-03-05 15:00:00
```

**API调用示例**：
```bash
curl -X POST http://192.168.171.153:3000/api/tasks/task_xxx/review \
  -H "Content-Type": application/json" \
  -d '{
    "approved": false,
    "score": 3,
    "comment": "缺少具体的技术细节和应用案例，需要补充",
    "createFollowUpTask": true,
    "followUpTaskTitle": "补充技术细节",
    "followUpTaskDescription": "在原基础上添加具体的技术参数和应用案例"
  }'
```

### 阶段5: 🔄 创建改进任务

**触发时机**：驳回时选择创建改进任务

**发送者**：Boss机器人

**消息格式**：
```
【🔄 改进任务已创建】

原任务ID: task_xxx
改进任务ID: task_yyy
标题: 补充技术细节
执行人: 牛马-Searcher

请根据Boss的审查意见完成改进任务。
```

---

## 🚀 完整工作流示例

### 示例1: 完整任务流程

```bash
# 1️⃣ Boss创建并分配任务（触发阶段1通知）
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "调研微服务架构",
    "description": "调研微服务架构的最佳实践和常见问题",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'

# → 群聊收到Boss通知："【📋 新任务分配】"

# 2️⃣ 系统自动调度（触发阶段2通知）
# → 群聊收到Searcher通知："【👋 任务已领取】"

# 3️⃣ 员工完成执行（触发阶段3通知）
# → 群聊收到Searcher通知："【✅ 任务已完成】"

# 4️⃣ Boss审查并驳回（触发阶段4b通知）
curl -X POST http://192.168.171.153:3000/api/tasks/task_xxx/review \
  -H "Content-Type": application/json" \
  -d '{
    "approved": false,
    "score": 3,
    "comment": "缺少案例分析",
    "createFollowUpTask": true
  }'

# → 群聊收到Boss通知："【🔴 任务需改进】"
# → 同时触发阶段5通知："【🔄 改进任务已创建】"

# 5️⃣ 改进任务完成，Boss最终通过
curl -X POST http://192.168.171.153:3000/api/tasks/task_yyy/review \
  -H "Content-Type": application/json" \
  -d '{"approved": true, "score": 5, "comment": "很好！"}'

# → 群聊收到Boss通知："【🎉 任务通过审查】"
```

---

## 🛠️ 测试通知功能

### 快速测试

```bash
# 测试Boss机器人
python3 /root/OpenClaw-bot-review/scripts/feishu_bot_send.py \
  --bot boss \
  --chat main \
  --message "Boss机器人测试成功"

# 测试Searcher机器人
python3 /root/OpenClaw-bot-review/scripts/feishu_bot_send.py \
  --bot searcher \
  --chat main \
  --message "Searcher机器人测试成功"

# 测试OSAdmin机器人
python3 /root/OpenClaw-bot-review/scripts/feishu_bot_send.py \
  --bot osadmin \
  --chat main \
  --message "OSAdmin机器人测试成功"
```

### 完整流程测试

```bash
# 运行完整测试脚本
./scripts/test-auto-dispatch.sh
```

这个脚本会：
1. 创建任务
2. 自动调度执行
3. 触发所有5个阶段的通知
4. 在飞书群中看到完整的通知流程

---

## 📱 自定义配置

### 修改群聊ID

编辑 `lib/feishu-notifier.ts`:
```typescript
const DEFAULT_CHAT_ID = "你的群聊ID";
```

### 添加新的机器人

1. 在飞书开放平台创建应用
2. 获取 App ID 和 App Secret
3. 更新 `scripts/feishu_bot_send.py`:
```python
BOTS = {
  "your_bot": {
    "app_id": "cli_xxx",
    "app_secret": "xxx",
    "name": "你的机器人"
  },
  # ... 其他bots
}
```

4. 更新 `lib/feishu-notifier.ts`:
```typescript
const BOT_CONFIG: Record<BotType, ...> = {
  your_bot: {
    name: "你的机器人",
    script: "/root/OpenClaw-bot-review/scripts/feishu_bot_send.py"
  },
  // ...
};
```

---

## 🔍 调试和监控

### 查看通知日志

通知发送时会输出日志：

```bash
# 成功日志
[Feishu] 发送消息: boss -> oc_721c9dd615cb420d023bbbac47c89352
[Feishu] 消息发送成功

# 失败日志
[Feishu] 发送消息: boss -> oc_xxx
[Feishu] 发送失败: ...
[Feishu] 通知失败: ...
```

### 验证通知是否发送

手动调用通知函数测试：

```typescript
// 在Node.js环境中测试
import * as FeishuNotifier from "@/lib/feishu-notifier";

await FeishuNotifier.notifyTaskAssigned(
  "test_task_id",
  "测试任务",
  "这是测试任务描述",
  "niuma-searcher"
);
```

---

## ❌ 常见问题

### Q1: 通知发送失败

**可能原因**：
1. 飞书机器人配置错误
2. 群聊ID不正确
3. 网络连接问题

**解决方法**：
```bash
# 检查配置
python3 scripts/feishu_bot_send.py --bot boss --chat main --message "测试"

# 检查网络
ping open.feishu.cn
```

### Q2: 消息重复发送

**可能原因**：
1. 任务状态被多次更新
2. 代码逻辑问题

**解决方法**：
- 检查任务状态更新逻辑
- 确保通知只在状态首次变化时发送

### Q3: 消息格式混乱

**可能原因**：
- 换行符处理问题

**解决方法**：
- 使用 `\n` 确保换行
- 测试消息在不同客户端的显示效果

---

## 📊 通知统计

### 查看通知发送情况

```bash
# 查看任务历史
cat /root/.openclaw/tasks/tasks.json | jq '.[] | {id, title, status, createdAt}'

# 统计各状态任务数量
cat /root/.openclaw/tasks/tasks.json | jq '[.[] | .status] | group_by(.) | map({status: .[0], count: length})'
```

---

## 🎉 总结

现在你的任务管理系统支持：

✅ **5个阶段自动通知**
- Boss分配任务
- 员工领取任务
- 员工完成任务
- Boss评估任务（通过/驳回）
- 创建改进任务

✅ **3个飞书机器人**
- Boss机器人（牛马-Boss）
- Searcher机器人（牛马-Searcher）
- OSAdmin机器人（牛马-OSAdmin）

✅ **完全自动化**
- 任务创建时自动通知
- 任务执行时自动通知
- 任务审查时自动通知

✅ **易于扩展**
- 支持自定义群聊
- 支持添加新机器人
- 支持自定义消息格式

开始使用吧！🚀

```bash
# 创建第一个任务，体验完整的通知流程
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试飞书通知",
    "description": "这是一个测试任务",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'
```
