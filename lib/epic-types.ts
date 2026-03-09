import type { TaskPriority, TaskStatus } from "./task-types";

export type EpicStatus =
  | "draft"
  | "running"
  | "stopping"
  | "stopped"
  | "completed"
  | "failed";

export type EpicIterationTrigger = "manual" | "scheduled";
export type EpicIterationStatus = "completed" | "failed";

export interface EpicPromptFiles {
  planner: string;
  reviewer: string;
  report: string;
}

export interface EpicTaskOperation {
  externalKey: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority?: TaskPriority;
  assignedTo?: string;
  dependsOnExternalKeys?: string[];
  tags?: string[];
  estimatedHours?: number;
  autoDispatch?: boolean;
}

export interface EpicTestPlanItem {
  agentId: string;
  objective: string;
  prompt: string;
  maxCalls?: number;
}

export interface EpicPlannerOutput {
  iterationGoal: string;
  taskOperations: EpicTaskOperation[];
  testPlan: EpicTestPlanItem[];
  optimizationHypotheses: string[];
  exitSignals: string[];
}

export interface EpicReviewIssue {
  problem: string;
  evidence: string;
  suggestion: string;
  acceptance: string;
}

export interface EpicReviewerOutput {
  goNoGo: "go" | "stop";
  overallProgress: string;
  issues: EpicReviewIssue[];
  nextRoundFocus: string[];
  reportMarkdown: string;
}

export interface EpicTaskOperationResult {
  externalKey: string;
  taskId?: string;
  action: "created" | "updated" | "skipped" | "failed";
  status?: string;
  message?: string;
}

export interface EpicTestRunResult {
  agentId: string;
  objective: string;
  success: boolean;
  durationMs: number;
  response?: string;
  error?: string;
}

export interface EpicIteration {
  id: string;
  epicId: string;
  iterationNo: number;
  trigger: EpicIterationTrigger;
  status: EpicIterationStatus;
  startedAt: number;
  endedAt: number;
  plannerPrompt: string;
  plannerRawResponse: string;
  plannerOutput?: EpicPlannerOutput;
  taskOperationResults: EpicTaskOperationResult[];
  testRuns: EpicTestRunResult[];
  reviewerPrompt: string;
  reviewerRawResponse: string;
  reviewerOutput?: EpicReviewerOutput;
  reportMarkdown: string;
  summaryDocumentPath?: string;
  summaryGeneratedAt?: number;
  callsUsed: number;
  callsByAgent: Record<string, number>;
  error?: string;
}

export interface EpicProject {
  id: string;
  title: string;
  frameworkPrompt: string;
  objective: string;
  successCriteria: string;
  ownerAgentId: string;
  status: EpicStatus;
  loopIntervalSeconds: number;
  durationLimitMs: number | null;
  callLimitTotal: number | null;
  stopRequested: boolean;
  startedAt?: number;
  stoppedAt?: number;
  lastIterationAt?: number;
  totalCallsUsed: number;
  callsByAgent: Record<string, number>;
  iterationsCompleted: number;
  taskBindings: Record<string, string>;
  latestReportMarkdown?: string;
  latestSummaryDocumentPath?: string;
  latestSummaryGeneratedAt?: number;
  promptFiles: EpicPromptFiles;
  createdAt: number;
  updatedAt: number;
}

export interface EpicBoundTask {
  externalKey: string;
  taskId: string;
  exists: boolean;
  title?: string;
  status?: TaskStatus | "missing";
  assignedTo?: string;
  dependsOnTaskIds?: string[];
  dependencyStatuses?: Array<{
    taskId: string;
    status: TaskStatus | "missing";
  }>;
  updatedAt?: number;
}

export interface CreateEpicProjectInput {
  title: string;
  frameworkPrompt: string;
  objective: string;
  successCriteria: string;
  ownerAgentId: string;
  loopIntervalSeconds: number;
  durationLimitMs: number | null;
  callLimitTotal: number | null;
  promptFiles: EpicPromptFiles;
}
