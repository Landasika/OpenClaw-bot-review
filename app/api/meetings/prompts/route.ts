import { NextResponse } from "next/server";
import { getSystemConfig, updateSystemConfig } from "@/lib/system-config";
import { normalizeMeetingPromptFiles, readMeetingPrompts, writeMeetingPrompts } from "@/lib/meeting-prompts";

export async function GET() {
  try {
    const config = getSystemConfig();
    const promptFiles = normalizeMeetingPromptFiles(config.meetingPromptFiles);
    const data = readMeetingPrompts(promptFiles);

    return NextResponse.json({
      success: true,
      files: data.files,
      prompts: data.prompts,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "读取会议 Prompt 失败",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = getSystemConfig({ forceRefresh: true });
    const nextFiles = normalizeMeetingPromptFiles(body.files || config.meetingPromptFiles);

    const content = {
      kickoff: typeof body?.prompts?.kickoff === "string" ? body.prompts.kickoff : undefined,
      employee: typeof body?.prompts?.employee === "string" ? body.prompts.employee : undefined,
      summary: typeof body?.prompts?.summary === "string" ? body.prompts.summary : undefined,
    };

    const result = writeMeetingPrompts(content, nextFiles);
    updateSystemConfig({ meetingPromptFiles: result.files });

    return NextResponse.json({
      success: true,
      files: result.files,
      prompts: result.prompts,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "保存会议 Prompt 失败",
      },
      { status: 400 }
    );
  }
}
