---
name: employee-task-execution
description: 适用于员工领取任务、执行任务、提交结果、响应审查意见的场景。用户提到“我来做这个任务/接受任务/提交结果/任务完成/按任务执行”时使用。
---

# 员工领取与完成任务 Skill

用于员工视角完成任务闭环：读取任务 -> 开始执行 -> 提交结果。

## 触发词（示例）

- 我来做这个任务
- 开始执行 task_xxx
- 提交执行结果
- 任务完成了
- 这是我的交付内容

## 输入要求

至少确认：

1. `taskId`
2. 执行人（当前员工 agent）
3. 结果格式要求（文本/附件/时长）

## 脚本快速入口

```bash
SKILL_DIR="skills/employee-task-execution"

# 查询任务
bash "$SKILL_DIR/scripts/task_get.sh" "task_xxx"

# 开始执行
bash "$SKILL_DIR/scripts/task_start.sh" "task_xxx"

# 提交结果（第二个参数可直接传文本，也可传结果文件路径）
bash "$SKILL_DIR/scripts/task_submit_result.sh" "task_xxx" "本次执行结果摘要" "2.5"

# 查询审查状态
bash "$SKILL_DIR/scripts/task_review_status.sh" "task_xxx"
```

## 标准流程

### 1) 读取任务详情

```bash
BASE_URL="${BASE_URL:-http://localhost:3000}"
TASK_ID="task_xxx"

curl -s "$BASE_URL/api/tasks/$TASK_ID" | jq .
```

应重点确认：

- `assignedTo` 是否是当前员工
- `status` 是否为 `assigned` 或 `in_progress`
- 验收要求是否明确

### 2) 标记开始执行（可选）

如果仍是 `assigned`，可先改为 `in_progress`：

```bash
curl -s -X PATCH "$BASE_URL/api/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' | jq .
```

### 3) 产出高质量结果

为提升自动审查通过率，结果建议满足：

1. 有足够细节（建议 > 100 字）
2. 包含数据/数字依据
3. 分段清晰（有换行结构）

推荐结果结构：

```text
1. 结论摘要
2. 执行步骤
3. 关键数据与证据
4. 风险与限制
5. 下一步建议
```

### 4) 提交执行结果

```bash
curl -s -X POST "$BASE_URL/api/tasks/$TASK_ID/result" \
  -H "Content-Type: application/json" \
  -d '{
    "result": "这里填写结构化执行结果",
    "attachments": [],
    "actualHours": 2.5
  }' | jq .
```

提交后目标状态应为 `submitted`。

### 5) 查询审查结果

```bash
curl -s "$BASE_URL/api/tasks/$TASK_ID" | jq '.task | {id,status,reviewScore,reviewComment,relatedTaskId}'
```

## 输出模板（给 Boss/用户）

```text
任务执行完成：
- 任务ID：task_xxx
- 当前状态：submitted
- 核心结论：...
- 关键数据：...
- 风险与待确认项：...
```

## 驳回后的处理

若状态为 `rejected`：

1. 先读取 `reviewComment`
2. 若生成 follow-up 任务，则切换到新任务继续执行
3. 提交新版结果时明确“本次改进点”

## 异常处理

1. `only assigned/in_progress can submit result`
- 先检查状态，必要时请求 Boss 重开任务或改状态。

2. `Task not found`
- 校验 `taskId` 是否正确。

3. `assignedTo` 不匹配
- 不越权执行，先让 Boss 重新分配。

## 协作约定

- 接到 Boss 新任务时优先使用本 skill。
- 需要任务拆解或重分配时，回到 `boss-task-dispatch` skill。
