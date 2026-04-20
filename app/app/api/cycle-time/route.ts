import { NextRequest, NextResponse } from "next/server";
import { getCycleTime } from "@/lib/weight-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const groupBy = req.nextUrl.searchParams.get("group_by") || "platform";
  const rows = await getCycleTime(req.nextUrl.searchParams, groupBy);
  return NextResponse.json(rows);
}
