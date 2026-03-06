# 实现结构总结（开发向）

本文给开发者定位代码入口，不再重复使用文档中的操作步骤。

更新时间：2026-03-06

## 1. 核心模块地图

### 任务 API

- `app/api/tasks/route.ts`
  - 任务创建与查询
  - 创建时按依赖决定 `pending/assigned/blocked`
- `app/api/tasks/assign/route.ts`
  - 二次分配任务
- `app/api/tasks/dispatch/route.ts`
  - 单任务调度与批量自动调度
- `app/api/tasks/[id]/result/route.ts`
  - 提交执行结果（`assigned/in_progress -> submitted`）
- `app/api/tasks/[id]/review/route.ts`
  - 审查结果（`submitted -> approved/rejected`）
- `app/api/task-scheduler/route.ts`
  - 控制 scheduler/reviewer 的 `start|stop|trigger|restart`

### 调度与审查服务

- `lib/task-scheduler.ts`
  - 单任务调度主逻辑
  - Agent 状态检查、等待空闲、执行 openclaw、结果回填
- `lib/task-scheduler-service.ts`
  - scheduler 定时循环
  - 依赖解锁、并发控制
- `lib/task-scheduler-extended.ts`
  - reviewer 定时循环
  - 自动评分与审查

### 依赖与状态

- `lib/task-dependency.ts`
  - 依赖解析与校验
  - `blocked <-> assigned` 判定支持
- `lib/task-store.ts`
  - 任务存储读写
- `lib/task-types.ts`
  - 状态与请求类型定义

### 通知与系统配置

- `lib/feishu-notifier.ts`
  - 飞书通知入口与消息模板
- `lib/system-config.ts`
  - `data/system-config.json` 读取、归一化与缓存

## 2. 关键设计点

- 依赖约束是“硬约束”：依赖不满足不会调度。
- 调度状态检查支持 `idle/working/offline`，可等待空闲。
- 任务失败会落状态（常见为 `cancelled`）并写入错误信息。
- 自动化服务（scheduler/reviewer）可独立启停与手动触发。
- 通知发送失败不会中断主流程（异步兜底）。

## 3. 主要可配置项

位于 `data/system-config.json`：

- 调度：`taskDispatchEnabled`、`taskDispatchIntervalSeconds`、`taskDispatchMaxConcurrent`
- 等待：`taskDispatchWaitForIdleMaxSeconds`、`taskDispatchWaitCheckIntervalSeconds`
- 审查：`bossReviewEnabled`、`bossReviewIntervalSeconds`、`bossReviewMaxConcurrent`
- 通知：`notificationEnabled`、`feishuNotificationEnabled`、`feishuDefaultChatId`、`feishuBotMap`、`feishuBots`

## 4. 常见扩展点

- 自定义审查规则：改 `lib/task-scheduler-extended.ts` 中评分逻辑。
- 增加通知模板：改 `lib/feishu-notifier.ts` 并在调用方接入。
- 新增任务状态：同步修改 `task-types`、API 约束与前端状态展示。
- 调度策略升级：在 `task-scheduler-service.ts` 增加优先级/队列策略。

## 5. 文档索引

- 流程： [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)
- 接口： [API_REFERENCE.md](./API_REFERENCE.md)
- 调度： [TASK_AUTO_DISPATCH.md](./TASK_AUTO_DISPATCH.md)
- 等待： [AGENT_IDLE_WAIT.md](./AGENT_IDLE_WAIT.md)
- 审查： [BOSS_AUTO_REVIEW.md](./BOSS_AUTO_REVIEW.md)
- 通知： [FEISHU_NOTIFICATIONS.md](./FEISHU_NOTIFICATIONS.md)
- 日志： [LOG_OUTPUT.md](./LOG_OUTPUT.md)
