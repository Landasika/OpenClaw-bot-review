# OpenClaw Bot 仪表盘

一个轻量级 Web 仪表盘，用于一览所有 [OpenClaw](https://github.com/openclaw/openclaw) 机器人/Agent/模型/会话的运行状态。

![仪表盘预览](docs/bot_dashboard.png)
![Pixel Office](docs/pixel-office.png)

## 背景介绍

当你在多个平台（飞书、Discord 等）上运行多个 OpenClaw Agent 时，管理和监控会变得越来越复杂——哪个机器人用了哪个模型？平台连通性如何？Gateway 是否正常？Token 消耗了多少？

本仪表盘读取本地 OpenClaw 配置和会话数据，提供统一的 Web 界面来实时监控和测试所有 Agent、模型、平台和会话。无需数据库——所有数据直接来源于 `~/.openclaw/openclaw.json` 和本地会话文件。

此外，内置像素风动画办公室，让你的 Agent 化身像素角色在办公室里行走、就座、互动，为枯燥的运维增添一份趣味。

## 核心功能

- **机器人总览** — 卡片墙展示所有 Agent 的名称、Emoji、模型、平台绑定、会话统计和 Gateway 健康状态
- **模型列表** — 查看所有已配置的 Provider 和模型，包含上下文窗口、最大输出、推理支持及单模型测试
- **会话管理** — 按 Agent 浏览所有会话，支持类型识别（私聊、群聊、定时任务）、Token 用量和连通性测试
- **消息统计** — Token 消耗和平均响应时间趋势，支持按天/周/月查看，SVG 图表展示
- **技能管理** — 查看所有已安装技能（内置、扩展、自定义），支持搜索和筛选
- **告警中心** — 配置告警规则（模型不可用、机器人无响应），通过飞书发送通知
- **Gateway 健康检测** — 实时 Gateway 状态指示器，10 秒自动轮询，点击可跳转 OpenClaw Web 页面
- **平台连通测试** — 一键测试所有飞书/Discord 绑定和 DM Session 的连通性
- **自动刷新** — 可配置刷新间隔（手动、10秒、30秒、1分钟、5分钟、10分钟）
- **主题切换** — 侧边栏支持深色/浅色主题切换
- **像素办公室** — 像素风动画办公室，Agent 以像素角色呈现，实时行走、就座、与家具互动

## 界面预览

### 机器人仪表盘
![仪表盘预览](docs/bot_dashboard.png)

### 模型列表
![模型列表预览](docs/models-preview.png)

### 会话管理
![会话列表预览](docs/sessions-preview.png)

### 像素办公室
![像素办公室](docs/pixel-office.png)

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/xmanrui/OpenClaw-bot-review.git
cd OpenClaw-bot-review

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000) 即可访问。

## 技术栈

- **Next.js** — React 框架
- **TypeScript** — 类型安全
- **Tailwind CSS** — 样式框架
- **零数据库** — 直接读取配置文件

## 环境要求

- Node.js 18+
- 已安装 OpenClaw，配置文件位于 `~/.openclaw/openclaw.json`

## 自定义配置路径

默认读取 `~/.openclaw/openclaw.json`，可通过环境变量指定自定义路径：

```bash
OPENCLAW_HOME=/opt/openclaw
npm run dev
```

## Docker 部署

### 构建镜像

```bash
docker build -t openclaw-dashboard .
```

### 运行容器

```bash
# 基础运行
docker run -d -p 3000:3000 openclaw-dashboard

# 挂载自定义 OpenClaw 配置路径
docker run -d \
  --name openclaw-dashboard \
  -p 3000:3000 \
  -e OPENCLAW_HOME=/opt/openclaw \
  -v /path/to/openclaw:/opt/openclaw \
  openclaw-dashboard
```

## 项目结构

```
OpenClaw-bot-review/
├── app/                    # Next.js App Router
│   └── api/               # API 路由
│       ├── activity-heatmap/
│       ├── agent-status/
│       ├── alerts/
│       ├── config/
│       ├── pixel-office/
│       ├── sessions/
│       └── stats-*/
├── lib/                   # 核心逻辑
│   ├── pixel-office/      # 像素办公室引擎
│   │   ├── bugs/         # Bug 系统
│   │   ├── editor/       # 编辑器
│   │   ├── engine/       # 游戏引擎
│   │   ├── layout/       # 布局系统
│   │   └── sprites/      # 精灵图
│   └── task-scheduler.ts # 任务调度器
└── public/               # 静态资源
```

## 开发

```bash
# 安装依赖
npm install

# 运行开发服务器
npm run dev

# 构建生产版本
npm run build

# 运行生产服务器
npm start
```

## 许可证

MIT
