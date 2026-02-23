"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  threshold?: number;
}

interface AlertConfig {
  enabled: boolean;
  receiveAgent: string;
  rules: AlertRule[];
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
}

const RULE_DESCRIPTIONS: Record<string, string> = {
  model_unavailable: "模型不可用 - 当测试模型失败时触发",
  bot_no_response: "Bot 长时间无响应 - 当机器人超过设定时间未响应时触发",
  message_failure_rate: "消息失败率升高 - 当消息失败率超过阈值时触发",
  cron连续_failure: "Cron 连续失败 - 当定时任务连续失败超过设定次数时触发",
};

export default function AlertsPage() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<string[]>([]);
  const [lastCheckTime, setLastCheckTime] = useState<string>("");
  const [checkInterval, setCheckInterval] = useState(5); // 默认 5 分钟检查一次

  // 加载配置
  useEffect(() => {
    Promise.all([
      fetch("/api/alerts").then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()),
    ])
      .then(([alertData, configData]) => {
        setConfig(alertData);
        setAgents(configData.agents || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 定时检查告警
  useEffect(() => {
    if (!config?.enabled) return;
    
    const checkAlerts = () => {
      setChecking(true);
      fetch("/api/alerts/check", { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          if (data.results && data.results.length > 0) {
            setCheckResults(data.results);
            setLastCheckTime(new Date().toLocaleTimeString("zh-CN"));
          }
        })
        .catch(console.error)
        .finally(() => setChecking(false));
    };

    // 立即检查一次
    checkAlerts();

    // 设置定时器
    const timer = setInterval(checkAlerts, checkInterval * 60 * 1000);
    return () => clearInterval(timer);
  }, [config?.enabled, checkInterval]);

  const handleManualCheck = () => {
    setChecking(true);
    fetch("/api/alerts/check", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.results && data.results.length > 0) {
          setCheckResults(data.results);
          setLastCheckTime(new Date().toLocaleTimeString("zh-CN"));
        }
      })
      .catch(console.error)
      .finally(() => setChecking(false));
  };

  const handleToggle = () => {
    if (!config) return;
    setSaving(true);
    fetch("/api/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !config.enabled }),
    })
      .then((r) => r.json())
      .then((newConfig) => {
        setConfig(newConfig);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .finally(() => setSaving(false));
  };

  const handleAgentChange = (agentId: string) => {
    if (!config) return;
    setSaving(true);
    fetch("/api/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiveAgent: agentId }),
    })
      .then((r) => r.json())
      .then((newConfig) => {
        setConfig(newConfig);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .finally(() => setSaving(false));
  };

  const handleRuleToggle = (ruleId: string) => {
    if (!config) return;
    const rules = config.rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    setSaving(true);
    fetch("/api/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    })
      .then((r) => r.json())
      .then((newConfig) => {
        setConfig(newConfig);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .finally(() => setSaving(false));
  };

  const handleThresholdChange = (ruleId: string, value: number) => {
    if (!config) return;
    const rules = config.rules.map((r) =>
      r.id === ruleId ? { ...r, threshold: value } : r
    );
    setSaving(true);
    fetch("/api/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    })
      .then((r) => r.json())
      .then((newConfig) => {
        setConfig(newConfig);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Failed to load alert config</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🔔 {t("alerts.title") || "Alert Center"}
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {t("alerts.subtitle") || "Configure system alerts and notifications"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 检查间隔设置 */}
          {config.enabled && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">检查间隔:</span>
              <select
                value={checkInterval}
                onChange={(e) => setCheckInterval(Number(e.target.value))}
                className="px-2 py-1 text-sm rounded border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
              >
                <option value={1}>1 分钟</option>
                <option value={5}>5 分钟</option>
                <option value={10}>10 分钟</option>
                <option value={30}>30 分钟</option>
              </select>
            </div>
          )}
          {/* 手动检查按钮 */}
          {config.enabled && (
            <button
              onClick={handleManualCheck}
              disabled={checking}
              className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition disabled:opacity-50"
            >
              {checking ? "⏳ 检查中..." : "🔄 立即检查"}
            </button>
          )}
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition"
          >
            {t("common.backHome") || "Back"}
          </Link>
        </div>
      </div>

      {/* 检查结果展示 */}
      {config.enabled && checkResults.length > 0 && (
        <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-yellow-400">⚠️ 告警触发 ({checkResults.length})</h3>
            {lastCheckTime && <span className="text-xs text-[var(--text-muted)]">{lastCheckTime}</span>}
          </div>
          <ul className="space-y-1">
            {checkResults.map((result, i) => (
              <li key={i} className="text-sm text-yellow-300">• {result}</li>
            ))}
          </ul>
        </div>
      )}

      {config.enabled && checking && (
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] mb-6 text-center text-[var(--text-muted)]">
          ⏳ 正在检查告警...
        </div>
      )}

      {/* 告警总开关 */}
      <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("alerts.enableAlerts") || "Enable Alerts"}</h2>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              {t("alerts.enableDesc") || "Turn on/off all alert notifications"}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
              config.enabled ? "bg-green-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                config.enabled ? "translate-x-7" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* 接收告警的机器人 */}
      <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] mb-6">
        <h2 className="text-lg font-semibold mb-3">
          {t("alerts.receiveAgent") || "Receive Alert Agent"}
        </h2>
        <p className="text-[var(--text-muted)] text-sm mb-4">
          {t("alerts.receiveAgentDesc") || "Select which agent will receive alert notifications"}
        </p>
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => handleAgentChange(agent.id)}
              disabled={!config.enabled || saving}
              className={`px-4 py-2 rounded-lg border transition ${
                config.receiveAgent === agent.id
                  ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
                  : "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--accent)]"
              } ${!config.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {agent.emoji} {agent.name}
            </button>
          ))}
        </div>
      </div>

      {/* 告警规则列表 */}
      <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <h2 className="text-lg font-semibold mb-3">
          {t("alerts.rules") || "Alert Rules"}
        </h2>
        <p className="text-[var(--text-muted)] text-sm mb-4">
          {t("alerts.rulesDesc") || "Configure which conditions trigger alerts"}
        </p>
        <div className="space-y-4">
          {config.rules.map((rule) => (
            <div
              key={rule.id}
              className="p-4 rounded-lg border border-[var(--border)] bg-[var(--bg)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleRuleToggle(rule.id)}
                    disabled={!config.enabled || saving}
                    className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                      rule.enabled ? "bg-green-500" : "bg-gray-600"
                    } ${!config.enabled ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        rule.enabled ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <div>
                    <h3 className="font-medium">{rule.name}</h3>
                    <p className="text-[var(--text-muted)] text-xs">
                      {RULE_DESCRIPTIONS[rule.id] || ""}
                    </p>
                  </div>
                </div>
                {rule.threshold !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {rule.id === "bot_no_response" ? "Timeout (s):" : 
                       rule.id === "message_failure_rate" ? "Failure rate (%):" :
                       rule.id === "cron连续_failure" ? "Max failures:" : "Threshold:"}
                    </span>
                    <input
                      type="number"
                      value={rule.threshold}
                      onChange={(e) => handleThresholdChange(rule.id, Number(e.target.value))}
                      disabled={!config.enabled || !rule.enabled || saving}
                      className="w-20 px-2 py-1 text-sm rounded border border-[var(--border)] bg-[var(--card)] text-[var(--text)] disabled:opacity-50"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 保存提示 */}
      {saved && (
        <div className="fixed bottom-8 right-8 px-4 py-2 rounded-lg bg-green-500 text-white text-sm animate-fade-in">
          ✓ Saved
        </div>
      )}
    </main>
  );
}
