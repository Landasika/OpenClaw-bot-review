import { NextResponse } from "next/server";
import {
  createEpicProject,
  getEpicRuntimeState,
  listEpicProjects,
} from "@/lib/epic-loop-service";
import { getDefaultAgentId } from "@/lib/system-config";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
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

    const projects = await listEpicProjects(limit);
    const items = projects.map((project) => ({
      ...project,
      runtime: getEpicRuntimeState(project.id),
    }));

    return NextResponse.json({
      success: true,
      epics: items,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "读取大任务列表失败" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const frameworkPrompt = typeof body.frameworkPrompt === "string" ? body.frameworkPrompt.trim() : "";
    const objective = typeof body.objective === "string" ? body.objective.trim() : "";
    const successCriteria = typeof body.successCriteria === "string" ? body.successCriteria.trim() : "";

    if (!title || !frameworkPrompt || !objective || !successCriteria) {
      return NextResponse.json(
        { success: false, error: "缺少必填字段: title/frameworkPrompt/objective/successCriteria" },
        { status: 400 }
      );
    }

    const loopIntervalSeconds = Number.isFinite(body.loopIntervalSeconds)
      ? Math.max(10, Math.floor(Number(body.loopIntervalSeconds)))
      : 300;

    const durationLimitMs = body.durationLimitMs === null || body.durationLimitMs === undefined
      ? null
      : Math.max(1, Math.floor(Number(body.durationLimitMs)));
    const callLimitTotal = body.callLimitTotal === null || body.callLimitTotal === undefined
      ? null
      : Math.max(1, Math.floor(Number(body.callLimitTotal)));

    const project = await createEpicProject({
      title,
      frameworkPrompt,
      objective,
      successCriteria,
      ownerAgentId: typeof body.ownerAgentId === "string" ? body.ownerAgentId : getDefaultAgentId(),
      loopIntervalSeconds,
      durationLimitMs,
      callLimitTotal,
      promptFiles: body.promptFiles,
    });

    return NextResponse.json({
      success: true,
      epic: {
        ...project,
        runtime: getEpicRuntimeState(project.id),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "创建大任务失败" },
      { status: 500 }
    );
  }
}
