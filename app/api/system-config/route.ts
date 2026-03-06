import { NextResponse } from "next/server";
import { getSystemConfig } from "@/lib/system-config";

export async function GET() {
  const config = getSystemConfig();
  return NextResponse.json(config);
}
