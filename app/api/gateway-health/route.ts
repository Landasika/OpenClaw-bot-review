import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSystemConfig } from "@/lib/system-config";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");

export async function GET() {
  try {
    const systemConfig = getSystemConfig();
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    const port = config.gateway?.port || systemConfig.gatewayDefaultPort;
    const token = config.gateway?.auth?.token || "";

    const url = `http://localhost:${port}/health`;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        error: `HTTP ${resp.status}`,
        details: text || `请求 ${url} 失败`
      });
    }

    const contentType = resp.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      data = await resp.json().catch(() => null);
    } else {
      const text = await resp.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    return NextResponse.json({
      ok: true,
      data,
      webUrl: `http://localhost:${port}/chat${token ? '?token=' + encodeURIComponent(token) : ''}`
    });
  } catch (err: any) {
    const msg = err.cause?.code === "ECONNREFUSED"
      ? "Gateway 未运行"
      : err.name === "AbortError"
        ? "请求超时"
        : err.message;
    return NextResponse.json({ ok: false, error: msg });
  }
}
