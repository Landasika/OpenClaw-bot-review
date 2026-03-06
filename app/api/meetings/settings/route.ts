import { NextResponse } from "next/server";
import { getSystemConfig, updateSystemConfig } from "@/lib/system-config";
import {
  getMeetingServiceStatus,
  startMeetingService,
  stopMeetingService,
} from "@/lib/meeting-service";
import {
  DEFAULT_MEETING_DISCUSSION_STATUSES,
  VALID_MEETING_DISCUSSION_STATUSES,
} from "@/lib/meeting-types";
import { normalizeMeetingPromptFiles } from "@/lib/meeting-prompts";
import type { TaskStatus } from "@/lib/task-types";

function parseMeetingDailyTime(value: unknown): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    throw new Error("meetingDailyTime 必须是 HH:MM 格式");
  }
  return value;
}

function parseMeetingTimezone(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("meetingTimezone 必须是非空字符串");
  }
  return value.trim();
}

function parseMeetingParticipants(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("meetingParticipants 必须是字符串数组");
  }
  if (value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error("meetingParticipants 的数组项必须是非空字符串");
  }
  return value.map((item) => String(item));
}

function parseDiscussionStatuses(value: unknown): TaskStatus[] {
  if (!Array.isArray(value)) {
    throw new Error("meetingDiscussionStatuses 必须是数组");
  }

  const output: TaskStatus[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") {
      throw new Error("meetingDiscussionStatuses 的数组项必须是字符串");
    }

    if (!VALID_MEETING_DISCUSSION_STATUSES.includes(raw as TaskStatus)) {
      throw new Error(`不支持的任务状态: ${raw}`);
    }

    output.push(raw as TaskStatus);
  }

  return output.length > 0 ? output : DEFAULT_MEETING_DISCUSSION_STATUSES;
}

export async function GET() {
  const config = getSystemConfig();
  const meetingStatus = getMeetingServiceStatus();

  return NextResponse.json({
    success: true,
    settings: {
      meetingEnabled: config.meetingEnabled,
      meetingDailyTime: config.meetingDailyTime,
      meetingTimezone: config.meetingTimezone,
      meetingParticipants: config.meetingParticipants,
      meetingDiscussionStatuses: config.meetingDiscussionStatuses,
      meetingPromptFiles: config.meetingPromptFiles,
    },
    availableAgents: config.availableAgents,
    defaultAgent: config.defaultAgent,
    runtime: {
      meeting: meetingStatus,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = getSystemConfig({ forceRefresh: true });

    const meetingEnabled = Boolean(body.meetingEnabled);
    const meetingDailyTime = parseMeetingDailyTime(body.meetingDailyTime);
    const meetingTimezone = parseMeetingTimezone(body.meetingTimezone);
    const meetingParticipants = parseMeetingParticipants(body.meetingParticipants)
      .filter((agentId) => config.availableAgents.includes(agentId));
    const meetingDiscussionStatuses = parseDiscussionStatuses(body.meetingDiscussionStatuses);
    const meetingPromptFiles = normalizeMeetingPromptFiles(body.meetingPromptFiles);

    const next = updateSystemConfig({
      meetingEnabled,
      meetingDailyTime,
      meetingTimezone,
      meetingParticipants,
      meetingDiscussionStatuses,
      meetingPromptFiles,
    });

    const statusBefore = getMeetingServiceStatus();
    if (statusBefore.running) {
      stopMeetingService();
      startMeetingService();
    } else if (next.meetingEnabled) {
      // 配置页保存后，若启用了会议服务，则自动启动
      startMeetingService();
    }

    return NextResponse.json({
      success: true,
      settings: {
        meetingEnabled: next.meetingEnabled,
        meetingDailyTime: next.meetingDailyTime,
        meetingTimezone: next.meetingTimezone,
        meetingParticipants: next.meetingParticipants,
        meetingDiscussionStatuses: next.meetingDiscussionStatuses,
        meetingPromptFiles: next.meetingPromptFiles,
      },
      runtime: {
        meeting: getMeetingServiceStatus(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "保存会议设置失败",
      },
      { status: 400 }
    );
  }
}
