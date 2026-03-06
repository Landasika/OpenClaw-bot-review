import { NextResponse } from "next/server";
import { meetingStore } from "@/lib/meeting-store";
import type { MeetingStatus } from "@/lib/meeting-types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limitRaw = searchParams.get("limit");

    let limit: number | undefined;
    if (limitRaw !== null) {
      const parsed = Number(limitRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json(
          { success: false, error: "limit 必须是正整数" },
          { status: 400 }
        );
      }
      limit = Math.floor(parsed);
    }

    const meetings = await meetingStore.listMeetings({
      status: status as MeetingStatus | undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      meetings,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "读取会议列表失败",
      },
      { status: 500 }
    );
  }
}
