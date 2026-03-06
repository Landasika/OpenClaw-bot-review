# 文档导航

这个目录只保留一套不重复的说明文档：每篇只负责一个主题，公共 API 统一放在 `API_REFERENCE.md`。

## 阅读顺序

1. [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md)：先理解全流程与状态机
2. [API_REFERENCE.md](./API_REFERENCE.md)：查具体接口参数
3. [TASK_AUTO_DISPATCH.md](./TASK_AUTO_DISPATCH.md)：调度能力
4. [AGENT_IDLE_WAIT.md](./AGENT_IDLE_WAIT.md)：Agent 忙碌时等待机制
5. [BOSS_AUTO_REVIEW.md](./BOSS_AUTO_REVIEW.md)：自动审查
6. [FEISHU_NOTIFICATIONS.md](./FEISHU_NOTIFICATIONS.md)：飞书通知配置
7. [LOG_OUTPUT.md](./LOG_OUTPUT.md)：日志定位与排障
8. [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)：代码模块地图

## 文档边界（避免重复）

- `TASK_LIFECYCLE.md`: 只讲端到端流程与状态流转，不重复接口字段。
- `API_REFERENCE.md`: 只讲接口，不重复业务流程。
- `TASK_AUTO_DISPATCH.md`: 只讲调度，不重复审查与通知细节。
- `AGENT_IDLE_WAIT.md`: 只讲等待逻辑，不重复调度基础。
- `BOSS_AUTO_REVIEW.md`: 只讲审查规则，不重复调度细节。
- `FEISHU_NOTIFICATIONS.md`: 只讲通知配置与事件映射。
- `LOG_OUTPUT.md`: 只讲日志关键字和排障路径。

## 图片资源

- `docs/images/bot_dashboard.png`
- `docs/images/dashboard-preview.jpg`
- `docs/images/models-preview.png`
- `docs/images/pixel-office.png`
- `docs/images/sessions-preview.png`

## 维护规范

- 示例地址统一使用 `http://localhost:3000`。
- 新增文档前先检查是否已有主题覆盖，优先补充现有文档。
- 新增接口请先更新 `API_REFERENCE.md`，再在专题文档添加链接。
