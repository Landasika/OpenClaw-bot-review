import fs from "fs";
import path from "path";
import type {
  MeetingActionItem,
  MeetingRecord,
  MeetingSpeakerNote,
  MeetingTaskSnapshot,
  MeetingTrigger,
  MeetingPromptFiles,
} from "./meeting-types";
import type { TaskStatus } from "./task-types";

const PROJECT_ROOT = process.cwd();
const MEETING_INDEX_FILE = path.join(PROJECT_ROOT, "data", "meetings", "meetings.json");
const MEETING_DIR = path.dirname(MEETING_INDEX_FILE);
const MAX_MEETING_RECORDS = 200;

function clampMeetingRecords(records: MeetingRecord[]): MeetingRecord[] {
  if (records.length <= MAX_MEETING_RECORDS) {
    return records;
  }
  return records
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_MEETING_RECORDS);
}

export class MeetingStore {
  private ensureDirs() {
    if (!fs.existsSync(MEETING_DIR)) {
      fs.mkdirSync(MEETING_DIR, { recursive: true });
    }
  }

  private getIndex(): MeetingRecord[] {
    this.ensureDirs();
    if (!fs.existsSync(MEETING_INDEX_FILE)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(MEETING_INDEX_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((item) => typeof item === "object" && item !== null) as MeetingRecord[];
    } catch {
      return [];
    }
  }

  private saveIndex(records: MeetingRecord[]): void {
    this.ensureDirs();
    const clipped = clampMeetingRecords(records);
    fs.writeFileSync(MEETING_INDEX_FILE, `${JSON.stringify(clipped, null, 2)}\n`, "utf-8");
  }

  generateId(): string {
    return `meeting_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async createMeeting(input: {
    trigger: MeetingTrigger;
    bossAgentId: string;
    participants: string[];
    discussionStatuses: TaskStatus[];
    taskSnapshot: MeetingTaskSnapshot[];
    promptFiles: MeetingPromptFiles;
    scheduledForDate?: string;
  }): Promise<MeetingRecord> {
    const records = this.getIndex();

    const record: MeetingRecord = {
      id: this.generateId(),
      status: "running",
      trigger: input.trigger,
      startedAt: Date.now(),
      scheduledForDate: input.scheduledForDate,
      bossAgentId: input.bossAgentId,
      participants: input.participants,
      discussionStatuses: input.discussionStatuses,
      taskSnapshot: input.taskSnapshot,
      promptFiles: input.promptFiles,
      notes: [],
      actionItems: [],
      errors: [],
    };

    records.unshift(record);
    this.saveIndex(records);
    return record;
  }

  async appendSpeakerNote(meetingId: string, note: MeetingSpeakerNote): Promise<MeetingRecord | null> {
    const records = this.getIndex();
    const idx = records.findIndex((item) => item.id === meetingId);
    if (idx < 0) {
      return null;
    }

    records[idx] = {
      ...records[idx],
      notes: [...records[idx].notes, note],
    };

    this.saveIndex(records);
    return records[idx];
  }

  async completeMeeting(
    meetingId: string,
    result: {
      bossSummary: string;
      actionItems: MeetingActionItem[];
      errors?: string[];
    }
  ): Promise<MeetingRecord | null> {
    const records = this.getIndex();
    const idx = records.findIndex((item) => item.id === meetingId);
    if (idx < 0) {
      return null;
    }

    records[idx] = {
      ...records[idx],
      status: "completed",
      endedAt: Date.now(),
      bossSummary: result.bossSummary,
      actionItems: result.actionItems,
      errors: result.errors ?? records[idx].errors,
    };

    this.saveIndex(records);
    return records[idx];
  }

  async failMeeting(meetingId: string, error: string): Promise<MeetingRecord | null> {
    const records = this.getIndex();
    const idx = records.findIndex((item) => item.id === meetingId);
    if (idx < 0) {
      return null;
    }

    const nextErrors = [...records[idx].errors, error];
    records[idx] = {
      ...records[idx],
      status: "failed",
      endedAt: Date.now(),
      errors: nextErrors,
    };

    this.saveIndex(records);
    return records[idx];
  }

  async setMeetingErrors(meetingId: string, errors: string[]): Promise<MeetingRecord | null> {
    const records = this.getIndex();
    const idx = records.findIndex((item) => item.id === meetingId);
    if (idx < 0) {
      return null;
    }

    records[idx] = {
      ...records[idx],
      errors,
    };

    this.saveIndex(records);
    return records[idx];
  }

  async getMeeting(meetingId: string): Promise<MeetingRecord | null> {
    const records = this.getIndex();
    return records.find((item) => item.id === meetingId) || null;
  }

  async listMeetings(filter?: {
    status?: MeetingRecord["status"];
    limit?: number;
  }): Promise<MeetingRecord[]> {
    const records = this.getIndex().sort((a, b) => b.startedAt - a.startedAt);

    let result = records;
    if (filter?.status) {
      result = result.filter((item) => item.status === filter.status);
    }

    if (typeof filter?.limit === "number" && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }
}

export const meetingStore = new MeetingStore();
