import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface ProbeResult {
  provider?: string;
  model?: string;
  mode?: "api_key" | "oauth" | string;
  status?: "ok" | "error" | "unknown" | string;
  error?: string;
  latencyMs?: number;
}

function parseJsonFromMixedOutput(output: string): any {
  // `openclaw models status --json` may print warnings/logs before JSON.
  for (let i = 0; i < output.length; i++) {
    if (output[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < output.length; j++) {
      const ch = output[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = output.slice(i, j + 1).trim();
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") return parsed;
          } catch {}
          break;
        }
      }
    }
  }
  throw new Error("Failed to parse JSON output from openclaw models status --probe --json");
}

export async function POST(req: Request) {
  try {
    const { provider: providerId, modelId } = await req.json();
    if (!providerId || !modelId) {
      return NextResponse.json({ error: "Missing provider or modelId" }, { status: 400 });
    }

    const startedAt = Date.now();
    const { stdout, stderr } = await execFileAsync(
      "openclaw",
      ["models", "status", "--probe", "--json", "--probe-provider", String(providerId)],
      {
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: "0" },
      }
    );
    const parsed = parseJsonFromMixedOutput(`${stdout}\n${stderr || ""}`);
    const results: ProbeResult[] = parsed?.auth?.probes?.results || [];
    const fullModel = `${providerId}/${modelId}`;

    const exact =
      results.find((r) => r.provider === providerId && r.model === fullModel) ||
      results.find((r) => r.provider === providerId && typeof r.model === "string" && r.model.endsWith(`/${modelId}`));
    const matched = exact || results.find((r) => r.provider === providerId);

    if (!matched) {
      return NextResponse.json(
        {
          ok: false,
          error: `No probe result for provider ${providerId}`,
          elapsed: Date.now() - startedAt,
          model: fullModel,
        },
        { status: 404 }
      );
    }

    const ok = matched.status === "ok";
    const error = matched.error || (!ok ? `Probe status: ${matched.status || "unknown"}` : undefined);
    return NextResponse.json({
      ok,
      elapsed: matched.latencyMs ?? Date.now() - startedAt,
      model: matched.model || fullModel,
      mode: matched.mode || "unknown",
      status: matched.status || "unknown",
      error,
      text: ok ? "OK (openclaw models status --probe)" : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Probe failed", elapsed: 0 },
      { status: 500 }
    );
  }
}
