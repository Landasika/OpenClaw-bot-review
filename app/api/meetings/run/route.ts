import { NextResponse } from "next/server";
import { triggerMeetingNow } from "@/lib/meeting-service";

export async function POST() {
  try {
    const result = await triggerMeetingNow();

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "会议执行失败",
          meetingId: result.meetingId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      meetingId: result.meetingId,
      message: "会议已触发",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "会议执行失败",
      },
      { status: 500 }
    );
  }
}
