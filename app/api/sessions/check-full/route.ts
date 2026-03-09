import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as FeishuNotifier from "@/lib/feishu-notifier";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");

interface SessionData {
  sessionId: string;
  updatedAt: number;
  totalTokens: number;
  contextTokens: number;
  systemSent: boolean;
}

interface SessionsJson {
  [key: string]: SessionData;
}

interface FullSession {
  agentId: string;
  sessionKey: string;
  sessionType: string;
  usagePercent: number;
  totalTokens: number;
  contextTokens: number;
}

// 检查所有机器人的会话是否满了
function checkAllSessionsFull(): FullSession[] {
  const agentsDir = path.join(OPENCLAW_HOME, "agents");
  const fullSessions: FullSession[] = [];

  try {
    const agentIds = fs.readdirSync(agentsDir).filter(f =>
      fs.statSync(path.join(agentsDir, f)).isDirectory()
    );

    for (const agentId of agentIds) {
      const sessionsPath = path.join(agentsDir, agentId, "sessions/sessions.json");

      if (!fs.existsSync(sessionsPath)) {
        continue;
      }

      try {
        const raw = fs.readFileSync(sessionsPath, "utf-8");
        const sessions: SessionsJson = JSON.parse(raw);

        for (const [sessionKey, sessionData] of Object.entries(sessions)) {
          if (sessionData.contextTokens > 0) {
            const usagePercent = (sessionData.totalTokens / sessionData.contextTokens) * 100;

            if (usagePercent > 90) {
              const sessionType = getSessionType(sessionKey);
              fullSessions.push({
                agentId,
                sessionKey,
                sessionType,
                usagePercent,
                totalTokens: sessionData.totalTokens,
                contextTokens: sessionData.contextTokens,
              });
            }
          }
        }
      } catch (err) {
        console.error(`Failed to parse sessions for ${agentId}:`, err);
      }
    }
  } catch (err) {
    console.error("Failed to check sessions:", err);
  }

  return fullSessions;
}

function getSessionType(sessionKey: string): string {
  if (sessionKey.endsWith(":main")) return "main";
  if (sessionKey.includes(":feishu:direct:")) return "feishu-dm";
  if (sessionKey.includes(":feishu:group:")) return "feishu-group";
  if (sessionKey.includes(":discord:direct:")) return "discord-dm";
  if (sessionKey.includes(":discord:channel:")) return "discord-channel";
  if (sessionKey.includes(":telegram:direct:")) return "telegram-dm";
  if (sessionKey.includes(":telegram:group:")) return "telegram-group";
  if (sessionKey.includes(":whatsapp:direct:")) return "whatsapp-dm";
  if (sessionKey.includes(":whatsapp:group:")) return "whatsapp-group";
  if (sessionKey.includes(":cron:")) return "cron";
  return "unknown";
}

// 检查上次告警时间，避免频繁告警
function shouldAlert(agentId: string, sessionKey: string): boolean {
  const alertsCachePath = path.join(OPENCLAW_HOME, ".session_full_alerts_cache.json");

  try {
    if (fs.existsSync(alertsCachePath)) {
      const raw = fs.readFileSync(alertsCachePath, "utf-8");
      const cache = JSON.parse(raw);

      const key = `${agentId}:${sessionKey}`;
      const lastAlert = cache[key] || 0;
      const now = Date.now();

      // 如果距离上次告警不到1小时，跳过
      if (now - lastAlert < 3600000) {
        return false;
      }
    }
  } catch (err) {
    console.error("Failed to read alerts cache:", err);
  }

  return true;
}

// 更新告警时间缓存
function updateAlertCache(agentId: string, sessionKey: string): void {
  const alertsCachePath = path.join(OPENCLAW_HOME, ".session_full_alerts_cache.json");
  let cache: Record<string, number> = {};

  try {
    if (fs.existsSync(alertsCachePath)) {
      const raw = fs.readFileSync(alertsCachePath, "utf-8");
      cache = JSON.parse(raw);
    }

    const key = `${agentId}:${sessionKey}`;
    cache[key] = Date.now();

    fs.writeFileSync(alertsCachePath, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error("Failed to update alerts cache:", err);
  }
}

export async function POST() {
  try {
    const fullSessions = checkAllSessionsFull();

    if (fullSessions.length === 0) {
      return NextResponse.json({
        success: true,
        fullSessions: [],
        message: "No sessions are full"
      });
    }

    // 发送告警
    const alertsSent: string[] = [];

    for (const session of fullSessions) {
      if (shouldAlert(session.agentId, session.sessionKey)) {
        try {
          await FeishuNotifier.notifySessionFull(
            session.agentId,
            session.sessionKey,
            session.sessionType,
            session.usagePercent
          );

          updateAlertCache(session.agentId, session.sessionKey);
          alertsSent.push(`${session.agentId}:${session.sessionKey}`);
        } catch (err) {
          console.error(`Failed to send alert for ${session.agentId}:${session.sessionKey}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      fullSessions,
      alertsSent,
      message: `Found ${fullSessions.length} full session(s), sent ${alertsSent.length} alert(s)`
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
