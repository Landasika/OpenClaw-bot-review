import { NextResponse } from "next/server";
import { meetingStore } from "@/lib/meeting-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const meeting = await meetingStore.getMeeting(id);

    if (!meeting) {
      return NextResponse.json(
        {
          success: false,
          error: `会议不存在: ${id}`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      meeting,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "读取会议详情失败",
      },
      { status: 500 }
    );
  }
}
