---
name: boss-task-dispatch
description: 适用于 Boss 需要拆解目标、分配任务、设置依赖、触发调度并跟踪执行状态的场景。用户提到“分配任务/派活/任务拆解/任务排期/安排员工/推进执行/自动调度”时使用。
---

# Boss 任务分配与调度 Skill

用于把业务目标转成可执行任务，并推动进入自动化执行闭环。

## 触发词（示例）

- 分配任务
- 给员工派活
- 拆成子任务
- 安排 niuma-searcher / niuma-osadmin / niuma-coder
- 立即调度
- 批量调度

## 输入要求

至少收集以下信息：

1. 目标：要交付什么结果
2. 执行人：`assignedTo`
3. 完成标准：验收口径
4. 优先级：`low|medium|high|urgent`
5. 是否立即调度：`autoDispatch`

## 脚本快速入口

```bash
SKILL_DIR="skills/boss-task-dispatch"

# 查看/控制调度器与审查器
bash "$SKILL_DIR/scripts/scheduler_control.sh" status
bash "$SKILL_DIR/scripts/scheduler_control.sh" start scheduler
bash "$SKILL_DIR/scripts/scheduler_control.sh" start reviewer

# 创建/分配/调度任务
bash "$SKILL_DIR/scripts/task_create.sh" "任务标题" "任务描述" "niuma-searcher" "high" "true"
bash "$SKILL_DIR/scripts/task_assign.sh" "task_xxx" "niuma-coder"
bash "$SKILL_DIR/scripts/task_dispatch.sh" "task_xxx" "true" "1800000" "30000"
bash "$SKILL_DIR/scripts/task_dispatch_batch.sh" "5"

# 查询任务
bash "$SKILL_DIR/scripts/task_list.sh" "assigned" "" "50"

# 审查任务（驳回并创建改进任务）
bash "$SKILL_DIR/scripts/task_review.sh" "task_xxx" "false" "2" "./review-comment.md" "true"
```

## 标准流程

### 1) 检查自动化服务状态

```bash
BASE_URL="${BASE_URL:-http://localhost:3000}"

curl -s "$BASE_URL/api/task-scheduler" | jq .
```

如需启动：

```bash
curl -s -X POST "$BASE_URL/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"service":"scheduler","action":"start"}' | jq .

curl -s -X POST "$BASE_URL/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"service":"reviewer","action":"start"}' | jq .
```

### 2) 创建任务（单任务）

```bash
curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "任务标题",
    "description": "任务描述与验收标准",
    "priority": "high",
    "assignedTo": "niuma-searcher",
    "dependsOnTaskIds": [],
    "autoDispatch": true
  }' | jq .
```

### 3) 创建依赖任务（多任务）

先创建前置任务，记录 `task.id`，再写入后置任务的 `dependsOnTaskIds`。

状态规则：

- 依赖满足 -> `assigned`
- 依赖未满足 -> `blocked`（由 scheduler 自动解锁）

### 4) 给已有任务补分配

```bash
curl -s -X POST "$BASE_URL/api/tasks/assign" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"task_xxx","assignedTo":"niuma-coder"}' | jq .
```

### 5) 手动触发调度

单任务：

```bash
curl -s -X POST "$BASE_URL/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"task_xxx","waitForIdle":true,"maxWait":1800000,"checkInterval":30000}' | jq .
```

批量：

```bash
curl -s -X POST "$BASE_URL/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch":true,"limit":5}' | jq .
```

### 6) 跟踪执行状态

```bash
curl -s "$BASE_URL/api/tasks?limit=50" | jq '.tasks[] | {id,title,status,assignedTo,blockedReason}'
```

### 7) 任务审查（必须具体）

审查接口：

```bash
curl -s -X POST "$BASE_URL/api/tasks/task_xxx/review" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "score": 2,
    "comment": "具体审查意见",
    "createFollowUpTask": true
  }' | jq .
```

审查意见必须包含 4 部分：

1. 问题点：指出具体缺陷（内容/数据/结构/范围/时效）
2. 证据：引用结果中的具体段落、缺失项或冲突点
3. 修改建议：给出可执行动作，不用空话
4. 验收标准：说明改完后如何判断通过

禁止使用笼统表述（如“不够详细”“再完善一下”）而不说明具体改法。

推荐审查意见模板：

```text
【问题点】
1) ...
2) ...

【证据】
1) 原文 ...（缺少 ...）
2) 数据 ... 与任务要求 ... 不一致

【修改建议】
1) 补充 ...，至少包含 ...
2) 增加 ... 对比，并给出结论依据

【验收标准】
1) 必须包含 ... 指标
2) 必须回答任务描述中的 ... 问题
```

## 输出模板（给用户）

按以下结构汇报：

```text
任务分配完成：
- 新建任务数：N
- 已调度：N
- blocked：N（原因：...）
- 执行中：N

任务清单：
1) task_xxx | 标题 | assignedTo | status
2) task_yyy | 标题 | assignedTo | status

下一步：
- [ ] 待依赖完成后自动解锁的任务：...
- [ ] 需要手动处理的异常：...
```

审查反馈汇报模板：

```text
审查完成：
- 任务ID：task_xxx
- 结论：通过/驳回
- 评分：X/5

问题点：
1) ...
2) ...

修改建议：
1) ...
2) ...

验收标准：
1) ...
2) ...
```

## 异常处理

1. `Task status is blocked, cannot dispatch`
- 检查前置任务是否都 `approved`。

2. Agent 离线或调度失败
- 改派给其他 `assignedTo`，或等待 Agent 恢复后重试。

3. 任务长期停留 `assigned`
- 检查 scheduler 是否运行、并发上限是否过低。

## 协作约定

- 需要员工执行细节时，交给 `employee-task-execution` skill。
- 需要日常同步/复盘时，交给 `boss-meeting-host` skill。
