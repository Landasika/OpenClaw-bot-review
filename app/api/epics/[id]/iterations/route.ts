import { NextResponse } from "next/server";
import { getEpicProject, listEpicIterations } from "@/lib/epic-loop-service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const epic = await getEpicProject(id);
    if (!epic) {
      return NextResponse.json(
        { success: false, error: "大任务不存在" },
        { status: 404 }
      );
    }

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

    const iterations = await listEpicIterations(id, limit);
    return NextResponse.json({
      success: true,
      iterations,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "读取迭代历史失败" },
      { status: 500 }
    );
  }
}
