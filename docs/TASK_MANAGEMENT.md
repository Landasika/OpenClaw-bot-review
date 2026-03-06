# 任务管理系统使用说明

## 功能概述

这是一个完整的任务管理系统，支持Boss创建任务、分配给员工、员工提交结果、Boss审查的工作流程。

## 核心功能

### 1. Boss功能 (niuma-boss)
- ✅ 创建新任务
- ✅ 分配任务给员工
- ✅ 审查员工提交的结果
- ✅ 通过/驳回任务
- ✅ 对驳回的任务创建后续改进任务

### 2. 员工功能 (niuma-searcher, niuma-osadmin)
- ✅ 查看分配给自己的任务
- ✅ 更新任务状态（开始执行）
- ✅ 提交任务执行结果

### 3. 工作流程

```
待分配 (pending) → 已分配 (assigned) → 进行中 (in_progress)
  → 已提交 (submitted) → 已批准 (approved) / 已驳回 (rejected)
```

## API 端点

### 创建任务
```http
POST /api/tasks
Content-Type: application/json

{
  "title": "任务标题",
  "description": "任务描述",
  "priority": "medium",  // low | medium | high | urgent
  "assignedTo": "niuma-searcher",  // 可选
  "dueDate": 1234567890000,  // 可选，时间戳
  "estimatedHours": 8  // 可选
}
```

### 查询任务列表
```http
GET /api/tasks?status=assigned&assignedTo=niuma-searcher
```

查询参数：
- `status`: 任务状态
- `assignedTo`: 分配给谁
- `createdBy`: 谁创建的
- `limit`: 返回数量限制

### 获取任务详情
```http
GET /api/tasks/{taskId}
```

### 分配任务
```http
POST /api/tasks/assign
Content-Type: application/json

{
  "taskId": "task_xxx",
  "assignedTo": "niuma-searcher"
}
```

### 提交执行结果
```http
POST /api/tasks/{taskId}/result
Content-Type: application/json

{
  "result": "任务完成情况描述",
  "attachments": ["url1", "url2"],  // 可选
  "actualHours": 6  // 可选，实际工时
}
```

### 审查任务
```http
POST /api/tasks/{taskId}/review
Content-Type: application/json

{
  "approved": false,  // true=通过, false=驳回
  "comment": "需要改进以下几点...",
  "score": 3,  // 1-5分
  "createFollowUpTask": true,  // 是否创建后续任务
  "followUpTaskTitle": "重新完成xxx任务",
  "followUpTaskDescription": "根据审查意见改进..."
}
```

### 更新任务
```http
PATCH /api/tasks/{taskId}
Content-Type: application/json

{
  "status": "in_progress",  // 更新状态
  "result": "阶段性结果..."
}
```

## 使用示例

### 1. Boss创建并分配任务

```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "完成季度报告",
    "description": "整理Q4的销售数据并生成报告",
    "priority": "high",
    "assignedTo": "niuma-searcher",
    "estimatedHours": 8
  }'
```

### 2. 员工开始执行任务

```bash
# 更新任务状态为"进行中"
curl -X PATCH http://192.168.171.153:3000/api/tasks/{taskId} \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
```

### 3. 员工提交结果

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/{taskId}/result \
  -H "Content-Type: application/json" \
  -d '{
    "result": "已完成季度报告，数据已整理完毕",
    "actualHours": 7
  }'
```

### 4. Boss审查任务（驳回并创建改进任务）

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/{taskId}/review \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "comment": "数据分析不够深入，需要补充竞品对比",
    "score": 3,
    "createFollowUpTask": true,
    "followUpTaskTitle": "补充竞品分析",
    "followUpTaskDescription": "在原报告基础上增加竞品数据对比分析"
  }'
```

## Web界面

访问 `http://192.168.171.153:3000/tasks` 可以使用可视化的任务管理界面，包括：

- 任务列表展示
- 筛选功能（按状态）
- 创建新任务
- 查看任务详情
- Boss审查功能
- 实时状态更新

## 数据存储

任务数据存储在 `~/.openclaw/tasks/tasks.json`

## 状态流转规则

1. **pending** → **assigned**: 任务被分配给员工
2. **assigned** → **in_progress**: 员工开始执行
3. **in_progress** → **submitted**: 员工提交结果
4. **submitted** → **approved**: Boss审查通过
5. **submitted** → **rejected**: Boss驳回
6. **rejected** → 创建新任务（parentTaskId指向原任务）

## 最佳实践

1. **任务描述要清晰**：包含目标、要求、验收标准
2. **合理分配**：根据员工能力分配任务
3. **及时审查**：员工提交后尽快给出反馈
4. **建设性反馈**：驳回时说明具体改进点
5. **工时跟踪**：对比预估工时和实际工时，提高准确度

## Agent集成示例

### Boss Agent创建任务

```javascript
// 在niuma-boss的SKILL或配置中
const response = await fetch("http://192.168.171.153:3000/api/tasks", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "分析用户行为数据",
    description: "分析上周的用户行为数据，找出关键趋势",
    priority: "medium",
    assignedTo: "niuma-searcher",
    estimatedHours: 4
  })
});
```

### 员工Agent提交结果

```javascript
// 在niuma-searcher完成工作后
await fetch(`http://192.168.171.153:3000/api/tasks/${taskId}/result`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    result: "已完成分析，发现用户活跃度提升15%，主要来源于移动端",
    actualHours: 3.5
  })
});
```

## 扩展建议

1. **添加提醒功能**：任务到期前提醒
2. **添加评论系统**：任务执行过程中的讨论
3. **添加文件上传**：支持附件上传
4. **添加统计报表**：任务完成率、平均工时等
5. **添加模板**：常用任务模板
6. **添加标签系统**：更好的分类管理
