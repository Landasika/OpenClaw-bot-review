import fs from "fs";
import path from "path";
import type {
  CreateEpicProjectInput,
  EpicIteration,
  EpicProject,
} from "./epic-types";

const PROJECT_ROOT = process.cwd();
const EPIC_DIR = path.join(PROJECT_ROOT, "data", "epics");
const EPIC_PROJECTS_FILE = path.join(EPIC_DIR, "projects.json");
const EPIC_ITERATION_DIR = path.join(EPIC_DIR, "iterations");
const EPIC_REPORT_DIR = path.join(EPIC_DIR, "reports");
const MAX_ITERATIONS_PER_EPIC = 500;

export class EpicStore {
  private writeQueue: Promise<void> = Promise.resolve();

  private ensureDirs(): void {
    if (!fs.existsSync(EPIC_DIR)) {
      fs.mkdirSync(EPIC_DIR, { recursive: true });
    }
    if (!fs.existsSync(EPIC_ITERATION_DIR)) {
      fs.mkdirSync(EPIC_ITERATION_DIR, { recursive: true });
    }
    if (!fs.existsSync(EPIC_REPORT_DIR)) {
      fs.mkdirSync(EPIC_REPORT_DIR, { recursive: true });
    }
  }

  private getProjectsIndex(): Record<string, EpicProject> {
    this.ensureDirs();
    if (!fs.existsSync(EPIC_PROJECTS_FILE)) {
      return {};
    }

    try {
      const raw = fs.readFileSync(EPIC_PROJECTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, EpicProject>;
    } catch {
      return {};
    }
  }

  private saveProjectsIndex(index: Record<string, EpicProject>): void {
    this.ensureDirs();
    fs.writeFileSync(EPIC_PROJECTS_FILE, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
  }

  private async withWriteLock<T>(work: () => T | Promise<T>): Promise<T> {
    const run = this.writeQueue.then(() => work());
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private getIterationFilePath(epicId: string): string {
    return path.join(EPIC_ITERATION_DIR, `${epicId}.json`);
  }

  getReportDirPath(epicId: string): string {
    this.ensureDirs();
    return path.join(EPIC_REPORT_DIR, epicId);
  }

  private getIterations(epicId: string): EpicIteration[] {
    this.ensureDirs();
    const filePath = this.getIterationFilePath(epicId);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item) => item && typeof item === "object") as EpicIteration[];
    } catch {
      return [];
    }
  }

  private saveIterations(epicId: string, iterations: EpicIteration[]): void {
    this.ensureDirs();
    const filePath = this.getIterationFilePath(epicId);
    const clipped = iterations
      .sort((a, b) => b.iterationNo - a.iterationNo)
      .slice(0, MAX_ITERATIONS_PER_EPIC)
      .sort((a, b) => a.iterationNo - b.iterationNo);
    fs.writeFileSync(filePath, `${JSON.stringify(clipped, null, 2)}\n`, "utf-8");
  }

  generateId(): string {
    return `epic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  generateIterationId(epicId: string, iterationNo: number): string {
    return `${epicId}_iter_${String(iterationNo).padStart(4, "0")}`;
  }

  async createProject(input: CreateEpicProjectInput): Promise<EpicProject> {
    return this.withWriteLock(() => {
      const index = this.getProjectsIndex();
      const now = Date.now();
      const id = this.generateId();

      const project: EpicProject = {
        id,
        title: input.title,
        frameworkPrompt: input.frameworkPrompt,
        objective: input.objective,
        successCriteria: input.successCriteria,
        ownerAgentId: input.ownerAgentId,
        status: "draft",
        loopIntervalSeconds: input.loopIntervalSeconds,
        durationLimitMs: input.durationLimitMs,
        callLimitTotal: input.callLimitTotal,
        stopRequested: false,
        totalCallsUsed: 0,
        callsByAgent: {},
        iterationsCompleted: 0,
        taskBindings: {},
        promptFiles: input.promptFiles,
        createdAt: now,
        updatedAt: now,
      };

      index[id] = project;
      this.saveProjectsIndex(index);
      return project;
    });
  }

  async getProject(epicId: string): Promise<EpicProject | null> {
    const index = this.getProjectsIndex();
    return index[epicId] || null;
  }

  async updateProject(epicId: string, updates: Partial<EpicProject>): Promise<EpicProject | null> {
    return this.withWriteLock(() => {
      const index = this.getProjectsIndex();
      const existing = index[epicId];
      if (!existing) {
        return null;
      }

      const next: EpicProject = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      };
      index[epicId] = next;
      this.saveProjectsIndex(index);
      return next;
    });
  }

  async deleteProject(epicId: string): Promise<boolean> {
    return this.withWriteLock(() => {
      const index = this.getProjectsIndex();
      if (!index[epicId]) {
        return false;
      }

      delete index[epicId];
      this.saveProjectsIndex(index);

      const iterationFile = this.getIterationFilePath(epicId);
      if (fs.existsSync(iterationFile)) {
        fs.unlinkSync(iterationFile);
      }

      const reportDir = this.getReportDirPath(epicId);
      if (fs.existsSync(reportDir)) {
        fs.rmSync(reportDir, { recursive: true, force: true });
      }
      return true;
    });
  }

  async listProjects(limit?: number): Promise<EpicProject[]> {
    let projects = Object.values(this.getProjectsIndex()).sort((a, b) => b.updatedAt - a.updatedAt);
    if (typeof limit === "number" && limit > 0) {
      projects = projects.slice(0, limit);
    }
    return projects;
  }

  async appendIteration(epicId: string, iteration: EpicIteration): Promise<EpicIteration> {
    return this.withWriteLock(() => {
      const iterations = this.getIterations(epicId);
      iterations.push(iteration);
      this.saveIterations(epicId, iterations);
      return iteration;
    });
  }

  async listIterations(epicId: string, limit?: number): Promise<EpicIteration[]> {
    const iterations = this.getIterations(epicId).sort((a, b) => b.iterationNo - a.iterationNo);
    if (typeof limit === "number" && limit > 0) {
      return iterations.slice(0, limit);
    }
    return iterations;
  }

  async getLatestIteration(epicId: string): Promise<EpicIteration | null> {
    const list = await this.listIterations(epicId, 1);
    return list[0] || null;
  }
}

export const epicStore = new EpicStore();
