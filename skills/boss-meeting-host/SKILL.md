---
name: boss-meeting-host
description: 适用于 Boss 组织例会、配置会议参数、触发会议、生成总结与行动项的场景。用户提到“开会/例会/晨会/复盘会/主持会议/会议总结”时使用。
---

# Boss 会议主持 Skill

用于 Boss 视角执行会议闭环：配置 -> 触发 -> 跟踪 -> 总结 -> 落地行动项。

## 触发词（示例）

- 开个团队会议
- 主持今天晨会
- 触发例会
- 生成会议总结
- 把会议结论转成任务

## 输入要求

至少确认：

1. 参会人列表（`meetingParticipants`）
2. 会议时间（`meetingDailyTime` + `meetingTimezone`）
3. 讨论任务状态范围（`meetingDiscussionStatuses`）

## 脚本快速入口

```bash
SKILL_DIR="skills/boss-meeting-host"

# 会议配置
bash "$SKILL_DIR/scripts/meeting_settings_get.sh"
bash "$SKILL_DIR/scripts/meeting_settings_set.sh" "niuma-searcher,niuma-osadmin" "09:30" "Asia/Shanghai"

# Prompt 管理
bash "$SKILL_DIR/scripts/meeting_prompts_get.sh"
bash "$SKILL_DIR/scripts/meeting_prompts_set.sh" "./prompt/meeting-kickoff.md" "./prompt/meeting-employee.md" "./prompt/meeting-summary.md"

# 触发与查询会议
bash "$SKILL_DIR/scripts/meeting_run.sh"
bash "$SKILL_DIR/scripts/meeting_list.sh" "5"
bash "$SKILL_DIR/scripts/meeting_detail.sh" "meeting_xxx"
```

## 标准流程

### 1) 读取当前会议配置

```bash
BASE_URL="${BASE_URL:-http://localhost:3000}"

curl -s "$BASE_URL/api/meetings/settings" | jq .
```

### 2) 更新会议配置

```bash
curl -s -X POST "$BASE_URL/api/meetings/settings" \
  -H "Content-Type: application/json" \
  -d '{
    "meetingEnabled": true,
    "meetingDailyTime": "09:30",
    "meetingTimezone": "Asia/Shanghai",
    "meetingParticipants": ["niuma-searcher","niuma-osadmin"],
    "meetingDiscussionStatuses": ["pending","assigned","blocked","in_progress","rejected"],
    "meetingPromptFiles": {
      "kickoff": "meeting-kickoff.md",
      "employee": "meeting-employee.md",
      "summary": "meeting-summary.md"
    }
  }' | jq .
```

### 3) 查看/调整会议 Prompt

读取：

```bash
curl -s "$BASE_URL/api/meetings/prompts" | jq .
```

保存：

```bash
curl -s -X POST "$BASE_URL/api/meetings/prompts" \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": {
      "kickoff": "你是Boss，请主持会议并明确议程。",
      "employee": "请员工按四段结构汇报。",
      "summary": "请输出会议结论和行动项。"
    }
  }' | jq .
```

### 4) 手动触发会议

```bash
RUN=$(curl -s -X POST "$BASE_URL/api/meetings/run" -H "Content-Type: application/json" -d '{}')
echo "$RUN" | jq .
MEETING_ID=$(echo "$RUN" | jq -r '.meetingId')
```

### 5) 查询会议详情

```bash
curl -s "$BASE_URL/api/meetings/$MEETING_ID" | jq .
```

重点关注：

- `meeting.status`
- `meeting.bossSummary`
- `meeting.actionItems`
- `meeting.errors`

### 6) 会议结论落地任务（推荐）

将关键行动项转成任务，通过 `POST /api/tasks` 创建并分配执行人。

## 输出模板（给用户）

```text
会议完成：
- 会议ID：meeting_xxx
- 状态：completed
- 参会人：...
- 结论摘要：...
- 行动项：N 条

行动项落地：
1) 负责人 | 行动项 | 关联任务ID
2) 负责人 | 行动项 | 关联任务ID
```

## 异常处理

1. `没有可用参会员工`
- 先在 `meetingParticipants` 填入有效 agent id。

2. 会议状态 `failed`
- 查看 `meeting.errors`，修正 prompt 或 agent 可用性后重试。

3. 会议触发成功但无行动项
- 强化 `summary` prompt，要求输出明确 TODO 列表。

## 协作约定

- 会议行动项需要执行时，交给 `boss-task-dispatch` 分解与派发。
- 员工汇报质量不足时，要求使用 `employee-meeting-participant` skill 重提。
