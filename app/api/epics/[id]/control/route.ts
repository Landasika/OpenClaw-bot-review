import { NextResponse } from "next/server";
import {
  generateEpicProgressReport,
  getEpicRuntimeState,
  runEpicIterationOnce,
  startEpicLoop,
  stopEpicLoop,
} from "@/lib/epic-loop-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    switch (action) {
      case "start": {
        const result = await startEpicLoop(id);
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error || "启动失败" },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          message: "已启动循环迭代",
          epic: result.project ? { ...result.project, runtime: getEpicRuntimeState(result.project.id) } : undefined,
        });
      }
      case "stop": {
        const result = await stopEpicLoop(id);
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error || "停止失败" },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          message: "已设置停止指令",
          epic: result.project ? { ...result.project, runtime: getEpicRuntimeState(result.project.id) } : undefined,
        });
      }
      case "run_once": {
        const result = await runEpicIterationOnce(id);
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error || "执行失败", iteration: result.iteration },
            { status: 500 }
          );
        }
        return NextResponse.json({
          success: true,
          message: "已执行一轮迭代",
          epic: result.project ? { ...result.project, runtime: getEpicRuntimeState(result.project.id) } : undefined,
          iteration: result.iteration,
        });
      }
      case "report": {
        const result = await generateEpicProgressReport(id);
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error || "汇报失败" },
            { status: 500 }
          );
        }
        return NextResponse.json({
          success: true,
          message: "已生成并推送进度汇报",
          epic: result.project ? { ...result.project, runtime: getEpicRuntimeState(result.project.id) } : undefined,
          reportMarkdown: result.reportMarkdown,
        });
      }
      default:
        return NextResponse.json(
          { success: false, error: `未知 action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "控制操作失败" },
      { status: 500 }
    );
  }
}

