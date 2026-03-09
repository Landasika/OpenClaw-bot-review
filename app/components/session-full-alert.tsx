"use client";

import { useEffect, useState } from "react";

interface FullSession {
  agentId: string;
  sessionKey: string;
  sessionType: string;
  usagePercent: number;
  totalTokens: number;
  contextTokens: number;
}

export function SessionFullAlert() {
  const [fullSessions, setFullSessions] = useState<FullSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 初始检查
    checkFullSessions();

    // 定期检查（每5分钟）
    const interval = setInterval(checkFullSessions, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  async function checkFullSessions() {
    // 如果用户已经关闭了告警，跳过检查
    if (dismissed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/sessions/check-full");
      const data = await res.json();

      if (data.success && data.fullSessions && data.fullSessions.length > 0) {
        setFullSessions(data.fullSessions);
      } else {
        setFullSessions([]);
      }
    } catch (err) {
      console.error("Failed to check full sessions:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    setFullSessions([]);
  }

  if (dismissed || fullSessions.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500/95 border-b border-yellow-600/30 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-yellow-900">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-900">
              🚨 检测到 {fullSessions.length} 个会话已满
            </p>
            <div className="mt-1 text-xs text-yellow-800 space-y-1">
              {fullSessions.slice(0, 3).map((session, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-medium">{session.agentId}</span>
                  <span>·</span>
                  <span>{session.sessionType}</span>
                  <span>·</span>
                  <span>{session.usagePercent.toFixed(1)}%</span>
                </div>
              ))}
              {fullSessions.length > 3 && (
                <p className="text-yellow-700">还有 {fullSessions.length - 3} 个会话...</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.href = "/sessions"}
              className="px-3 py-1.5 text-xs font-medium bg-yellow-900 text-yellow-100 rounded hover:bg-yellow-800 transition"
            >
              查看会话
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 text-yellow-900 hover:text-yellow-700 transition"
              title="关闭"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
