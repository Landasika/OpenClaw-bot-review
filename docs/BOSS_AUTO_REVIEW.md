# Boss 自动审查功能使用指南

## 🎯 功能概述

Boss 审查器是一个**自动化审查服务**，会定期（每30秒）自动检查和审查已提交的任务。

### 核心功能
- ✅ **自动检查**：每 30 秒检查一次 `submitted` 状态的任务
- ✅ **智能评分**：AI 分析任务结果并自动评分（1-5分）
- ✅ **自动决策**：3分及以上自动通过，否则驳回
- ✅ **飞书通知**：自动发送审查结果通知
- ✅ **并发控制**：最多同时审查 2 个任务

---

## 🔄 完整自动化流程

```
┌─────────────────────────────────────────────────────┐
│           完整的任务自动化流程                        │
└─────────────────────────────────────────────────────┘

1. Boss 创建任务
   status: pending
   ↓
2. 分配给员工
   status: assigned
   ↓
3. 📋 任务调度器（每 1 分钟）
   自动调度 → in_progress
   ↓
4. 员工 Agent 执行完成
   status: submitted
   ↓
5. 👑 Boss 审查器（每 30 秒）
   自动审查 → approved/rejected
   ↓
6. 完成循环 ✅
```

**无需人工干预！**

---

## 🚀 快速开始

### 启动服务

访问 `http://192.168.171.153:3000/tasks`，在页面顶部找到 **"🤖 自动化服务"** 控制面板：

1. **启动任务调度器**：点击"▶️ 启动"（蓝色区域）
2. **启动 Boss 审查器**：点击"▶️ 启动"（紫色区域）

### 创建测试任务

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试自动审查",
    "description": "这是一个测试任务，会自动调度和审查",
    "assignedTo": "niuma-searcher"
  }'
```

### 观察自动化流程

1. **1 分钟内**：任务自动调度 → `in_progress`
2. **执行完成**：任务自动提交 → `submitted`
3. **30 秒内**：Boss 自动审查 → `approved` ✅

---

## 📊 Boss 智能审查标准

### 评分规则（1-5分）

| 分数 | 通过 | 标准 |
|------|------|------|
| ⭐⭐⭐⭐⭐ 5分 | ✅ | 结果详细、有数据、结构清晰 |
| ⭐⭐⭐⭐ 4分 | ✅ | 结果详细、有数据支撑 |
| ⭐⭐⭐ 3分 | ✅ | 基本完成，有详细信息 |
| ⭐⭐ 2分 | ❌ | 结果简单，缺少细节 |
| ⭐ 1分 | ❌ | 不符合要求 |

### 检测维度

1. **内容长度**：`result.length > 100`
2. **数据支撑**：包含数字或统计信息
3. **结构清晰**：包含换行符，有分段

### 审查逻辑

```typescript
// 计算分数
let score = 3;

if (hasDetail && hasData && hasStructure) score = 5;
else if (hasDetail && hasData) score = 4;
else if (hasDetail) score = 3;
else score = 2;

// 判断是否通过
const approved = score >= 3;
```

---

## 🎨 前端控制面板

### 调度器区域（蓝色）

```
┌─────────────────────────────────┐
│ 📋 任务调度器      🟢 运行中     │
├─────────────────────────────────┤
│ 已调度: 15 个                   │
│ 最后调度: 2026-03-05 18:00:00  │
├─────────────────────────────────┤
│ [⏸️ 停止] [🔄 立即检查] [🔄 重启] │
└─────────────────────────────────┘
```

### 审查器区域（紫色）

```
┌─────────────────────────────────┐
│ 👑 Boss 审查器    🟢 运行中     │
├─────────────────────────────────┤
│ 已审查: 42 个                   │
│ 最后审查: 2026-03-05 18:00:30  │
├─────────────────────────────────┤
│ [⏸️ 停止] [🔄 立即检查] [🔄 重启] │
└─────────────────────────────────┘
```

---

## 🔧 API 控制

### 查看状态
```bash
curl http://localhost:3000/api/task-scheduler
```

### 控制调度器
```bash
# 启动
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "service": "scheduler"}'

# 停止
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "stop", "service": "scheduler"}'

# 立即检查
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger", "service": "scheduler"}'
```

### 控制审查器
```bash
# 启动
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "service": "reviewer"}'

# 停止
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "stop", "service": "reviewer"}'

# 立即审查
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger", "service": "reviewer"}'
```

---

## 📈 使用示例

### 示例 1：完整自动化流程

```bash
# 1. 启动两个服务
curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "service": "scheduler"}'

curl -X POST http://localhost:3000/api/task-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "service": "reviewer"}'

# 2. 创建任务
TASK=$(curl -s -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "搜索最新AI新闻",
    "description": "搜索并总结今日AI领域的重要新闻",
    "assignedTo": "niuma-searcher"
  }' | jq -r '.task.id')

# 3. 等待自动化完成（最多 2 分钟）
sleep 120

# 4. 查看最终状态
curl -s http://localhost:3000/api/tasks/$TASK | \
  jq '.task | {title, status, reviewScore}'
```

**预期输出**：
```json
{
  "title": "搜索最新AI新闻",
  "status": "approved",
  "reviewScore": 5
}
```

### 示例 2：批量创建任务

```bash
# 创建 5 个任务
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/tasks \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"任务 $i\",
      \"description\": \"这是第 $i 个自动化测试任务\",
      \"assignedTo\": \"niuma-searcher\"
    }"
done

# 所有任务会自动：
# 1. 被调度器调度执行
# 2. 被 Boss 审查器审查
# 3. 自动完成整个流程
```

---

## ⚙️ 高级配置

### 调整检查间隔

**任务调度器**（`lib/task-scheduler-service.ts`）：
```typescript
const SCHEDULER_CONFIG = {
  checkInterval: 60 * 1000, // 改为 30 秒更快
  maxConcurrent: 5,         // 最多同时调度 5 个
};
```

**Boss 审查器**（`lib/task-scheduler-extended.ts`）：
```typescript
const REVIEWER_CONFIG = {
  checkInterval: 30 * 1000, // 改为 15 秒更快
  maxConcurrent: 3,         // 最多同时审查 3 个
};
```

### 自定义审查逻辑

修改 `bossIntelligentReview` 函数：

```typescript
async function bossIntelligentReview(task: any) {
  // 集成真实的 AI API
  const aiResponse = await callAI({
    model: "claude-3-5-sonnet-20241022",
    prompt: `
作为Boss，请审查以下任务结果：

任务标题: ${task.title}
任务描述: ${task.description}
执行结果: ${task.result}

请给出：
1. 评分（1-5分）
2. 是否通过（3分及以上）
3. 审查意见（中文）
    `
  });

  return {
    approved: aiResponse.approved,
    score: aiResponse.score,
    comment: aiResponse.comment,
  };
}
```

---

## 🎉 总结

现在您拥有**完整的自动化任务系统**：

### ✅ 自动化功能

1. **任务调度器**
   - 每 1 分钟自动检查
   - 自动调度 `assigned` 任务
   - 最多 3 个并发

2. **Boss 审查器**
   - 每 30 秒自动检查
   - 智能评分并决策
   - 最多 2 个并发

3. **完整闭环**
   ```
   创建 → 调度 → 执行 → 提交 → 审查 → 完成
    ↑                                      ↓
    └──────────── 自动循环 ──────────────────┘
   ```

### 🚀 立即使用

1. 访问 `http://192.168.171.153:3000/tasks`
2. 启动两个服务
3. 创建任务
4. **全自动完成！** 🎉

**无需任何手动操作！**
