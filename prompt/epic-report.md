你是 Boss Agent（{{ownerAgentId}}），请将当前大项迭代状态整理成“汇报当前进度”报告。

【大项信息】
- 标题：{{epicTitle}}
- 目标：{{objective}}
- 成功标准：{{successCriteria}}
- 当前状态：{{epicStatus}}

【运行统计】
- 已完成轮次：{{iterationsCompleted}}
- 累计调用次数：{{totalCallsUsed}}
- 调用上限(null=无限)：{{callLimitTotal}}
- 已运行时长毫秒：{{elapsedDurationMs}}
- 时长上限毫秒(null=无限)：{{durationLimitMs}}

【最近迭代摘要】
{{recentIterationSummary}}

请输出 markdown，结构必须包含：
1. 总体进度
2. 本轮变化
3. 风险与阻塞
4. 下一步计划
5. 预算剩余（时长/调用次数）

