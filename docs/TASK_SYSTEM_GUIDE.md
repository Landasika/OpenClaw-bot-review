# OpenClaw 任务管理系统使用指南

## 📋 目录

- [系统概述](#系统概述)
- [角色说明](#角色说明)
- [工作流程](#工作流程)
- [Boss 使用指南](#boss-使用指南)
- [员工使用指南](#员工使用指南)
- [API 使用示例](#api-使用示例)
- [Agent 集成示例](#agent-集成示例)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 系统概述

OpenClaw 任务管理系统是一个专为 AI Agent 团队协作设计的任务管理工具，支持：

- ✅ **任务分配**：Boss 创建并分配任务给员工
- ✅ **进度跟踪**：实时查看任务状态和执行进度
- ✅ **结果审查**：Boss 审查员工提交的工作成果
- ✅ **持续改进**：驳回时可创建改进任务，形成闭环
- ✅ **工时管理**：预估和实际工时对比，提高准确度
- ✅ **Web 界面**：直观的可视化操作界面
- ✅ **API 集成**：完整的 REST API，支持 Agent 自动化调用

**访问地址**：`http://192.168.171.153:3000/tasks`

---

## 角色说明

### 👔 Boss (niuma-boss)

**职责**：
- 创建新任务
- 分配任务给合适的员工
- 审查员工提交的工作成果
- 对任务进行评分和反馈
- 决定是否通过或要求改进

**权限**：
- 创建和删除任务
- 分配任务
- 审查任务（通过/驳回）
- 创建后续改进任务
- 查看所有任务

### 👥 员工 (niuma-searcher, niuma-osadmin)

**职责**：
- 查看分配给自己的任务
- 执行任务
- 提交工作成果
- 根据反馈改进工作

**权限**：
- 查看分配给自己的任务
- 更新任务状态（开始执行）
- 提交任务结果
- 查看审查意见

---

## 工作流程

### 完整任务生命周期

```
┌─────────────────────────────────────────────────────────────┐
│                     任务生命周期                              │
└─────────────────────────────────────────────────────────────┘

1. 📝 创建阶段
   Boss 创建任务 → 状态: pending (待分配)

2. 👥 分配阶段
   Boss 分配给员工 → 状态: assigned (已分配)

3. 🔨 执行阶段
   员工开始执行 → 状态: in_progress (进行中)

4. ✅ 提交阶段
   员工提交结果 → 状态: submitted (已提交)

5. 👀 审查阶段
   Boss 审查结果
   ├─ ✓ 通过 → 状态: approved (已完成)
   └─ ✗ 驳回 → 状态: rejected (已驳回)
                  ↓
              创建改进任务 → 回到步骤 2
```

### 状态说明

| 状态 | 英文 | 说明 | 操作者 |
|------|------|------|--------|
| 📋 待分配 | pending | 任务已创建，等待分配 | Boss |
| 👥 已分配 | assigned | 已分配给员工，等待开始 | Boss |
| 🔨 进行中 | in_progress | 员工正在执行 | 员工 |
| 📤 已提交 | submitted | 员工已提交，等待审查 | 员工 |
| ✅ 已批准 | approved | Boss 审查通过 | Boss |
| ❌ 已驳回 | rejected | Boss 要求改进 | Boss |

---

## Boss 使用指南

### 🎯 通过 Web 界面使用

#### 1. 创建任务

1. 访问 `http://192.168.171.153:3000/tasks`
2. 点击右上角 **"+ 新建任务"** 按钮
3. 填写任务信息：
   ```
   标题: 完成季度销售报告
   描述: 整理 Q4 的销售数据并生成分析报告
   优先级: 高
   分配给: niuma-searcher
   截止日期: 2026-03-10 18:00
   预估工时: 8 小时
   ```
4. 点击 **"创建"** 按钮

#### 2. 查看任务列表

- 使用顶部筛选器按状态查看任务：
  - **全部** - 所有任务
  - **pending** - 待分配的任务
  - **assigned** - 已分配待执行
  - **in_progress** - 进行中的任务
  - **submitted** - 待审查的任务
  - **approved** - 已完成的任务
  - **rejected** - 已驳回的任务

#### 3. 分配任务

**方式 1：创建时直接分配**
- 在创建任务时选择"分配给"字段

**方式 2：后续分配**
1. 点击任务卡片查看详情
2. 使用 API 调用分配（见下方 API 示例）

#### 4. 审查任务

1. 点击 **submitted** 状态的任务
2. 查看员工提交的结果
3. 填写审查信息：
   ```
   审查结果: ✓ 通过 或 ✗ 驳回
   评分: 1-5 分
   审查意见: 数据分析很详细，但缺少图表可视化
   ```
4. 如果驳回，可选择创建改进任务：
   ```
   ☑ 创建后续任务要求重新完成
   后续任务标题: 补充数据图表
   后续任务描述: 在原报告基础上添加可视化图表
   ```
5. 点击 **"提交审查"**

### 🔧 通过 API 使用

#### 创建任务

```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "完成用户行为分析",
    "description": "分析上周用户行为数据，找出关键趋势和洞察",
    "priority": "high",
    "assignedTo": "niuma-searcher",
    "estimatedHours": 6,
    "dueDate": '$(date -d '3 days' +%s)000'
  }'
```

**响应示例**：
```json
{
  "success": true,
  "task": {
    "id": "task_1772675200000_abc123",
    "title": "完成用户行为分析",
    "status": "assigned",
    "priority": "high",
    "assignedTo": "niuma-searcher",
    "createdAt": 1772675200000
  }
}
```

#### 分配任务

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/assign \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_xxx",
    "assignedTo": "niuma-osadmin"
  }'
```

#### 查询任务

```bash
# 查询所有待审查的任务
curl "http://192.168.171.153:3000/api/tasks?status=submitted"

# 查询分配给特定员工的任务
curl "http://192.168.171.153:3000/api/tasks?assignedTo=niuma-searcher"
```

#### 审查任务（通过）

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/task_xxx/review \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "comment": "完成得很好，分析很深入",
    "score": 5
  }'
```

#### 审查任务（驳回并创建改进任务）

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/task_xxx/review \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "comment": "缺少竞品对比分析，需要补充",
    "score": 3,
    "createFollowUpTask": true,
    "followUpTaskTitle": "补充竞品分析",
    "followUpTaskDescription": "在原分析基础上增加与主要竞品的对比"
  }'
```

---

## 员工使用指南

### 🎯 通过 Web 界面使用

#### 1. 查看分配的任务

1. 访问 `http://192.168.171.153:3000/tasks`
2. 点击筛选器 **"assigned"** 查看已分配的任务
3. 或点击 **"in_progress"** 查看正在执行的任务

#### 2. 开始执行任务

**方式 1：通过 API**（推荐 Agent 使用）
```bash
curl -X PATCH http://192.168.171.153:3000/api/tasks/task_xxx \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
```

**方式 2：Agent 自动更新**
- Agent 开始处理时自动更新状态

#### 3. 提交任务结果

1. 完成任务后，准备结果描述
2. 调用提交结果 API：

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/task_xxx/result \
  -H "Content-Type: application/json" \
  -d '{
    "result": "已完成用户行为分析：
1. 日活用户增长 15%
2. 平均使用时长增加 8 分钟
3. 转化率提升 3.2%

主要发现：
- 移动端用户活跃度显著提升
- 周末使用高峰在晚上 8-10 点
- 新用户留存率达到 45%

详细分析报告已上传至文档中心。",
    "actualHours": 5.5
  }'
```

**响应示例**：
```json
{
  "success": true,
  "task": {
    "id": "task_xxx",
    "status": "submitted",
    "result": "...",
    "actualHours": 5.5,
    "completedAt": 1772675500000
  },
  "message": "Task result submitted for review"
}
```

#### 4. 查看审查结果

```bash
# 查询已驳回的任务
curl "http://192.168.171.153:3000/api/tasks?status=rejected&assignedTo=niuma-searcher" | jq .

# 查看特定任务的审查意见
curl "http://192.168.171.153:3000/api/tasks/task_xxx" | jq '.task | {status, reviewComment, reviewScore}'
```

### 🔄 改进任务流程

当任务被驳回并创建改进任务后：

1. 员工会收到新的改进任务（parentTaskId 指向原任务）
2. 改进任务会自动分配给原员工
3. 根据审查意见重新执行
4. 再次提交结果

```bash
# 查询与原任务相关的改进任务
curl "http://192.168.171.153:3000/api/tasks?assignedTo=niuma-searcher" | \
  jq '.tasks[] | select(.parentTaskId == "原任务ID")'
```

---

## API 使用示例

### 完整的 API 端点列表

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/tasks` | 创建新任务 |
| GET | `/api/tasks` | 查询任务列表 |
| GET | `/api/tasks/{id}` | 获取任务详情 |
| PATCH | `/api/tasks/{id}` | 更新任务 |
| DELETE | `/api/tasks/{id}` | 删除任务 |
| POST | `/api/tasks/assign` | 分配任务 |
| POST | `/api/tasks/{id}/result` | 提交执行结果 |
| POST | `/api/tasks/{id}/review` | 审查任务 |

### 查询参数

**GET /api/tasks**

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| status | string | 按状态筛选 | `?status=submitted` |
| assignedTo | string | 按分配对象筛选 | `?assignedTo=niuma-searcher` |
| createdBy | string | 按创建者筛选 | `?createdBy=niuma-boss` |
| limit | number | 限制返回数量 | `?limit=10` |

### 数据模型

#### Task 对象

```typescript
{
  id: string;                    // 任务唯一 ID
  title: string;                 // 任务标题
  description: string;           // 任务描述
  status: "pending" | "assigned" | "in_progress" | "submitted" | "approved" | "rejected";
  priority: "low" | "medium" | "high" | "urgent";
  assignedTo?: string;           // 分配给的员工 ID
  createdBy: string;             // 创建者 ID
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
  dueDate?: number;              // 截止时间戳

  // 执行相关
  startedAt?: number;            // 开始执行时间
  completedAt?: number;          // 完成时间
  result?: string;               // 执行结果
  attachments?: string[];        // 附件 URL

  // 审查相关
  reviewedBy?: string;           // 审查者 ID
  reviewedAt?: number;           // 审查时间
  reviewComment?: string;        // 审查意见
  reviewScore?: number;          // 评分 1-5

  // 关联
  parentTaskId?: string;         // 父任务 ID（改进任务）
  tags?: string[];               // 标签
  estimatedHours?: number;       // 预估工时
  actualHours?: number;          // 实际工时
}
```

---

## Agent 集成示例

### Boss Agent 创建任务

在 Boss Agent 的 SKILL 或代码中：

```javascript
async function createTaskForEmployee(title, description, employeeId, priority = "medium") {
  const response = await fetch("http://192.168.171.153:3000/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      description,
      priority,
      assignedTo: employeeId,
      estimatedHours: estimateHours(title),  // 根据标题预估工时
      createdBy: "niuma-boss"
    })
  });

  const data = await response.json();
  if (data.success) {
    console.log(`✅ 任务已创建: ${data.task.id}`);
    return data.task;
  } else {
    console.error(`❌ 创建任务失败: ${data.error}`);
    return null;
  }
}

// 使用示例
await createTaskForEmployee(
  "分析服务器性能瓶颈",
  "检查过去 7 天的服务器日志，找出性能瓶颈和优化建议",
  "niuma-osadmin",
  "high"
);
```

### 员工 Agent 处理任务

```javascript
async function processAssignedTasks() {
  // 1. 获取分配给我的任务
  const response = await fetch("http://192.168.171.153:3000/api/tasks?assignedTo=niuma-searcher&status=assigned");
  const data = await response.json();

  if (!data.success || data.tasks.length === 0) {
    console.log("没有待处理的任务");
    return;
  }

  const task = data.tasks[0];
  console.log(`📋 开始处理任务: ${task.title}`);

  // 2. 更新状态为进行中
  await fetch(`http://192.168.171.153:3000/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_progress" })
  });

  // 3. 执行任务
  const result = await executeTask(task);

  // 4. 提交结果
  await fetch(`http://192.168.171.153:3000/api/tasks/${task.id}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      result: result.summary,
      actualHours: result.hoursSpent
    })
  });

  console.log(`✅ 任务已完成，等待审查: ${task.id}`);
}

async function executeTask(task) {
  // 根据任务描述执行具体工作
  // 这里是示例逻辑，实际应根据任务类型处理

  const startTime = Date.now();

  // 执行任务逻辑...
  const summary = `已完成 ${task.title}：\n${task.description}\n\n执行结果：...`;

  const hoursSpent = (Date.now() - startTime) / 1000 / 60 / 60;

  return { summary, hoursSpent };
}
```

### Boss Agent 定期审查

```javascript
async function reviewPendingTasks() {
  // 获取所有待审查的任务
  const response = await fetch("http://192.168.171.153:3000/api/tasks?status=submitted");
  const data = await response.json();

  if (!data.success || data.tasks.length === 0) {
    return;
  }

  for (const task of data.tasks) {
    console.log(`📝 审查任务: ${task.title}`);

    // 分析任务结果
    const analysis = analyzeTaskResult(task.result);

    if (analysis.passed) {
      // 通过
      await fetch(`http://192.168.171.153:3000/api/tasks/${task.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: true,
          comment: analysis.comment,
          score: analysis.score
        })
      });
      console.log(`✅ 任务已通过: ${task.title}`);
    } else {
      // 驳回并创建改进任务
      await fetch(`http://192.168.171.153:3000/api/tasks/${task.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: false,
          comment: analysis.comment,
          score: analysis.score,
          createFollowUpTask: true,
          followUpTaskTitle: `改进: ${task.title}`,
          followUpTaskDescription: analysis.improvements
        })
      });
      console.log(`❌ 任务已驳回，创建改进任务: ${task.title}`);
    }
  }
}

function analyzeTaskResult(result) {
  // 分析任务结果，决定是否通过
  // 这里是示例逻辑

  if (result.length > 100 && result.includes("详细")) {
    return {
      passed: true,
      comment: "完成得很详细，符合要求",
      score: 5
    };
  } else {
    return {
      passed: false,
      comment: "结果过于简单，需要更多细节",
      score: 2,
      improvements: "请补充以下内容：\n1. 具体数据\n2. 分析过程\n3. 可行性建议"
    };
  }
}
```

---

## 最佳实践

### 📝 任务描述

**好的任务描述**：
```
标题: 优化数据库查询性能

描述:
目标: 将用户列表查询响应时间从 2s 降至 500ms

具体要求:
1. 分析当前查询瓶颈
2. 添加必要的索引
3. 优化查询语句
4. 测试验证性能提升

验收标准:
- 响应时间 < 500ms
- 不影响现有功能
- 提供优化前后对比数据

截止时间: 明天 18:00
```

**不好的任务描述**：
```
标题: 优化数据库

描述: 数据库太慢了，快优化
```

### 🎯 任务分配

1. **匹配能力**
   - `niuma-searcher` → 搜索、调研、数据分析
   - `niuma-osadmin` → 系统管理、运维、技术任务

2. **控制并发**
   - 每个员工同时进行中的任务 ≤ 3 个
   - 高优先级任务优先分配

3. **合理预估**
   - 参考历史实际工时
   - 预留 20% 缓冲时间

### 👀 审查标准

**评分参考**：
- ⭐⭐⭐⭐⭐ (5分) - 超出预期，质量优秀
- ⭐⭐⭐⭐ (4分) - 符合预期，完成良好
- ⭐⭐⭐ (3分) - 基本符合，需少量改进
- ⭐⭐ (2分) - 部分符合，需较多改进
- ⭐ (1分) - 不符合要求，需重做

**审查要点**：
1. 完整性：是否完成所有要求
2. 质量：工作成果的质量
3. 时效：是否按时完成
4. 沟通：执行过程中的沟通

### 🔄 持续改进

1. **驳回后必创建改进任务**
   - 明确指出问题
   - 给出改进方向
   - 设定新的截止时间

2. **任务复盘**
   - 定期回顾已完成任务
   - 总结经验教训
   - 优化工作流程

---

## 常见问题

### Q1: 任务创建后找不到？

**A**: 检查筛选器设置，确保选择了正确的状态筛选。新创建的任务可能在 `pending` 或 `assigned` 状态。

### Q2: 员工看不到分配的任务？

**A**: 确认：
1. 任务状态是否为 `assigned`
2. `assignedTo` 字段是否正确填写员工 ID
3. 使用正确的查询：`/api/tasks?assignedTo=员工ID&status=assigned`

### Q3: 如何删除任务？

**A**:
```bash
curl -X DELETE http://192.168.171.153:3000/api/tasks/task_xxx
```

注意：只能删除 `pending` 或 `assigned` 状态的任务，已开始执行的任务不能删除。

### Q4: 工时预估不准怎么办？

**A**:
1. 参考类似任务的历史实际工时
2. 将大任务拆分为多个小任务
3. 定期回顾预估 vs 实际，调整预估模型

### Q5: 可以同时分配给多个员工吗？

**A**: 当前版本一个任务只能分配给一个员工。如需多人协作，可以：
1. 创建主任务分配给主要责任人
2. 创建子任务分配给其他成员

### Q6: 任务可以设置提醒吗？

**A**: 当前版本不支持自动提醒。可以通过以下方式：
1. Boss Agent 定期检查任务状态
2. 使用外部 cron 调用 API 检查即将到期的任务
3. 集成到告警系统

### Q7: 如何查看任务历史？

**A**:
```bash
# 查看某员工的所有任务
curl "/api/tasks?assignedTo=niuma-searcher" | jq '.tasks[] | {id, title, status, createdAt, reviewedAt}'

# 查看已完成的任务及其评分
curl "/api/tasks?status=approved" | jq '.tasks[] | {title, reviewScore, actualHours}'
```

### Q8: Agent 如何自动化处理任务？

**A**: 参考上面的 [Agent 集成示例](#agent-集成示例)，基本流程：
1. 员工 Agent 定期轮询 `assigned` 状态的任务
2. 获取任务后更新为 `in_progress`
3. 执行任务逻辑
4. 提交结果到 `submitted` 状态
5. Boss Agent 定期检查 `submitted` 任务并审查

---

## 技术支持

- **文档**: `docs/TASK_MANAGEMENT.md`
- **API 测试脚本**: `scripts/test-task-management.sh`
- **问题反馈**: 在项目中提 Issue

---

## 更新日志

### v1.0.0 (2026-03-05)
- ✅ 基础任务管理功能
- ✅ Web 界面
- ✅ REST API
- ✅ Boss 审查流程
- ✅ 改进任务闭环
- ✅ 工时管理

---

**祝您使用愉快！** 🎉
