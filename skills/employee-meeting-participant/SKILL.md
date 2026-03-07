---
name: employee-meeting-participant
description: 适用于员工参加团队会议、按结构汇报工作安排与改进计划、提出未完成任务处理建议的场景。用户提到“会议发言/会议汇报/参加例会/同步工作进展”时使用。
---

# 员工参会汇报 Skill

用于员工在会议中输出高质量、可执行的发言内容，并与任务系统对齐。

## 触发词（示例）

- 我要在会议上汇报
- 帮我准备会议发言
- 参加今天例会
- 输出今日计划和后续安排
- 复盘未完成任务

## 输入要求

至少确认：

1. 员工 `agentId`
2. 会议时间/主题
3. 是否有未完成任务需要复盘

## 脚本快速入口

```bash
SKILL_DIR="skills/employee-meeting-participant"

# 读取员工会议 prompt
bash "$SKILL_DIR/scripts/meeting_employee_prompt.sh"

# 查询我的任务
bash "$SKILL_DIR/scripts/my_tasks.sh" "niuma-searcher" "100"

# 汇报上下文（prompt + 任务）
bash "$SKILL_DIR/scripts/meeting_context.sh" "niuma-searcher" "50"
```

## 标准流程

### 1) 获取会议 prompt（对齐 Boss 口径）

```bash
BASE_URL="${BASE_URL:-http://localhost:3000}"
curl -s "$BASE_URL/api/meetings/prompts" | jq .
```

重点读取：

- `prompts.employee`

### 2) 拉取自己相关任务

```bash
AGENT_ID="niuma-searcher"

curl -s "$BASE_URL/api/tasks?assignedTo=$AGENT_ID&limit=100" | \
  jq '.tasks[] | {id,title,status,priority,blockedReason,updatedAt}'
```

建议重点关注状态：

- `pending`
- `assigned`
- `blocked`
- `in_progress`
- `rejected`

### 3) 生成会议发言（固定四段）

输出必须包含四个部分：

1. 今天工作安排
2. 后续安排
3. 自我进化计划（技能/流程/协作）
4. 未完成任务讨论与建议

每段至少包含：

- 目标
- 行动
- 风险
- 需要协助项（如有）

### 4) 会后落地

若 Boss 给出行动项：

1. 记录行动项和截止时间
2. 与 Boss 确认是否转任务
3. 已转任务后，切换到 `employee-task-execution` 继续执行

## 发言模板

```text
【今日工作安排】
- ...

【后续安排】
- ...

【自我进化计划】
- ...

【未完成任务讨论与建议】
- 任务ID: ...
  当前状态: ...
  风险: ...
  建议: ...
```

## 输出模板（给 Boss）

```text
员工会议汇报完成：
- 员工：agent_id
- 当前任务总数：N
- 未完成任务：N
- 需 Boss 决策项：N
```

## 异常处理

1. 任务数据不足
- 显式说明缺失信息，先按已知任务汇报，再提出补充请求。

2. 任务阻塞较多
- 聚焦 `blockedReason`，提出可执行的解锁方案。

3. 发言过于空泛
- 强制补充数据和明确下一步动作，不只讲结论。

## 协作约定

- 会议主持流程由 `boss-meeting-host` 负责。
- 会后任务执行由 `employee-task-execution` 负责。
