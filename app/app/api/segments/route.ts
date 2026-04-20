import { NextRequest, NextResponse } from "next/server";
import { getSegments } from "@/lib/weight-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const groupBy = params.get("group_by") || "platform_id";

  const ALLOWED_GROUPS = [
    "platform_id", "device", "match_type", "affiliate",
    "funnel_step", "utm_campaign", "keyword", "dti", "network", "user_country",
  ];
  if (!ALLOWED_GROUPS.includes(groupBy)) {
    return NextResponse.json({ error: "Invalid group_by" }, { status: 400 });
  }

  const rows = await getSegments(params, groupBy);
  return NextResponse.json(rows);
}
