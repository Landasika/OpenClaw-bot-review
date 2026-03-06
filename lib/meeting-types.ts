import type { TaskStatus } from "./task-types";

export type MeetingStatus = "scheduled" | "running" | "completed" | "failed";
export type MeetingTrigger = "manual" | "scheduled";

export interface MeetingPromptFiles {
  kickoff: string;
  employee: string;
  summary: string;
}

export interface MeetingPromptTextMap {
  kickoff: string;
  employee: string;
  summary: string;
}

export interface MeetingTaskSnapshot {
  id: string;
  title: string;
  status: TaskStatus;
  assignedTo?: string;
  blockedReason?: string;
  updatedAt: number;
}

export interface MeetingSpeakerNote {
  agentId: string;
  agentName: string;
  role: "boss" | "employee";
  content: string;
  timestamp: number;
  durationMs?: number;
  error?: string;
}

export interface MeetingActionItem {
  owner: string;
  content: string;
  relatedTaskId?: string;
}

export interface MeetingRecord {
  id: string;
  status: MeetingStatus;
  trigger: MeetingTrigger;
  startedAt: number;
  endedAt?: number;
  scheduledForDate?: string;
  bossAgentId: string;
  participants: string[];
  discussionStatuses: TaskStatus[];
  taskSnapshot: MeetingTaskSnapshot[];
  promptFiles: MeetingPromptFiles;
  notes: MeetingSpeakerNote[];
  bossSummary?: string;
  actionItems: MeetingActionItem[];
  errors: string[];
}

export interface MeetingSettings {
  meetingEnabled: boolean;
  meetingDailyTime: string;
  meetingTimezone: string;
  meetingParticipants: string[];
  meetingDiscussionStatuses: TaskStatus[];
  meetingPromptFiles: MeetingPromptFiles;
}

export const DEFAULT_MEETING_DISCUSSION_STATUSES: TaskStatus[] = [
  "pending",
  "assigned",
  "blocked",
  "in_progress",
  "rejected",
];

export const VALID_MEETING_DISCUSSION_STATUSES: TaskStatus[] = [
  "pending",
  "assigned",
  "blocked",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
];
