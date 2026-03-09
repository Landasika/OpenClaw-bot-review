import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const body = await req.json();
    const { sessionKey, sessionId } = body;

    if (!sessionKey && !sessionId) {
      return NextResponse.json(
        { error: "Missing sessionKey or sessionId" },
        { status: 400 }
      );
    }

    const sessionsPath = path.join(OPENCLAW_HOME, `agents/${agentId}/sessions/sessions.json`);

    if (!fs.existsSync(sessionsPath)) {
      return NextResponse.json(
        { error: "Sessions file not found" },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(sessionsPath, "utf-8");
    const sessions = JSON.parse(raw);

    let deletedSessions = [];
    let deletedFiles = [];

    // 删除指定的会话
    for (const [key, val] of Object.entries(sessions)) {
      const session = val as any;

      // 匹配 sessionKey 或 sessionId
      if ((sessionKey && key === sessionKey) || (sessionId && session.sessionId === sessionId)) {
        const sessionFilePath = session.sessionFile;

        // 删除会话文件
        if (sessionFilePath && fs.existsSync(sessionFilePath)) {
          try {
            fs.unlinkSync(sessionFilePath);
            deletedFiles.push(sessionFilePath);
          } catch (err: any) {
            console.error(`Failed to delete session file: ${sessionFilePath}`, err);
          }
        }

        deletedSessions.push(key);
        delete sessions[key];
      }
    }

    // 保存更新后的 sessions.json
    fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));

    return NextResponse.json({
      success: true,
      deletedSessions,
      deletedFiles,
      message: `Deleted ${deletedSessions.length} session(s)`
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  return POST(req, { params });
}
