# 任务管理系统 - 快速开始

## 🎯 5分钟上手指南

### 1. 创建任务（自动执行）

```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "搜索AI最新进展",
    "description": "总结2024年AI技术突破",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'
```

**系统会自动执行**：
```
✅ 创建任务
✅ 调用 openclaw agent --agent niuma-searcher --message "..."
✅ 获取执行结果
✅ 自动提交到任务系统
```

### 2. Web界面操作

访问：`http://192.168.171.153:3000/tasks`

- 📋 查看任务列表
- ➕ 创建新任务
- 🚀 立即调度任务
- 👀 审查任务结果

### 3. Boss审查任务

任务执行完成后，Boss可以审查：

```bash
curl -X POST http://192.168.171.153:3000/api/tasks/{taskId}/review \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "comment": "完成得很好",
    "score": 5
  }'
```

---

## 📊 完整工作流

```
┌──────────────────────────────────────────────┐
│ 1. Boss: 创建任务                             │
│    POST /api/tasks + autoDispatch:true       │
└──────────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────┐
│ 2. 系统: 自动调度                             │
│    openclaw agent --agent niuma-searcher    │
└──────────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────┐
│ 3. 员工: AI自动执行                           │
│    搜索/分析/处理任务                         │
└──────────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────┐
│ 4. 系统: 自动提交结果                         │
│    更新任务状态为 submitted                   │
└──────────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────┐
│ 5. Boss: 审查结果                             │
│    POST /api/tasks/{id}/review               │
└──────────────────────────────────────────────┘
                  ↓
              ✅ 通过 / ❌ 驳回
```

---

## 🎮 常用命令

### 创建并立即执行

```bash
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "任务标题",
    "description": "任务描述",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'
```

### 查询我的任务

```bash
# 查询所有待执行的任务
curl "http://192.168.171.153:3000/api/tasks?status=assigned"

# 查询待审查的任务
curl "http://192.168.171.153:3000/api/tasks?status=submitted"
```

### 手动调度任务

```bash
# 调度单个任务
curl -X POST http://192.168.171.153:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{"taskId": "task_xxx"}'

# 批量自动调度
curl -X POST http://192.168.171.153:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch": true, "limit": 5}'
```

### 审查任务

```bash
# 通过
curl -X POST http://192.168.171.153:3000/api/tasks/task_xxx/review \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "score": 5, "comment": "很好"}'

# 驳回并创建改进任务
curl -X POST http://192.168.171.153:3000/api/tasks/task_xxx/review \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "score": 3,
    "comment": "需要补充更多细节",
    "createFollowUpTask": true,
    "followUpTaskTitle": "补充详细分析",
    "followUpTaskDescription": "在原基础上添加更多细节"
  }'
```

---

## 👥 员工分工

### niuma-searcher (搜索专家)
✅ 擅长：网络搜索、信息收集、数据分析

```bash
# 示例任务
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "调研竞品功能",
    "description": "搜索并分析主要竞品的核心功能",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'
```

### niuma-osadmin (运维专家)
✅ 擅长：系统管理、日志分析、性能优化

```bash
# 示例任务
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "检查服务器状态",
    "description": "检查所有服务器的CPU、内存、磁盘使用情况",
    "assignedTo": "niuma-osadmin",
    "autoDispatch": true
  }'
```

---

## 🔥 实战示例

### 示例1: 日常调研

```bash
# 每天早上自动调研行业动态
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "今日AI行业动态",
    "description": "搜索今天AI领域的最新新闻和进展",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true,
    "priority": "medium",
    "tags": ["daily", "research"]
  }'
```

### 示例2: 系统巡检

```bash
# 每周自动巡检系统
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "周度系统巡检",
    "description": "检查系统各项指标：\n1. 服务器资源使用率\n2. 数据库性能\n3. 应用日志错误",
    "assignedTo": "niuma-osadmin",
    "autoDispatch": true,
    "priority": "high",
    "estimatedHours": 2
  }'
```

### 示例3: 批量任务

```bash
# 创建多个相关任务
for topic in "LLM" "多模态" "Agent"; do
  curl -X POST http://192.168.171.153:3000/api/tasks \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"调研 ${topic} 技术栈\",
      \"description\": \"搜索 ${topic} 的主流框架和工具\",
      \"assignedTo\": \"niuma-searcher\",
      \"autoDispatch\": false
    }"
done

# 批量调度
curl -X POST http://192.168.171.153:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch": true, "limit": 5}'
```

---

## 📱 访问地址

- **Web界面**: http://192.168.171.153:3000/tasks
- **API文档**: 见 `docs/TASK_AUTO_DISPATCH.md`
- **完整指南**: 见 `docs/TASK_SYSTEM_GUIDE.md`

---

## 🎉 开始使用

最简单的方式：

```bash
# 一键测试
./scripts/test-auto-dispatch.sh

# 或手动创建第一个任务
curl -X POST http://192.168.171.153:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "我的第一个任务",
    "description": "测试任务系统",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'
```

然后访问 http://192.168.171.153:3000/tasks 查看结果！

**就是这么简单！** 🚀
