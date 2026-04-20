import { NextRequest, NextResponse } from "next/server";
import { getKeywords } from "@/lib/weight-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get("limit") || 100));
  const rows = await getKeywords(req.nextUrl.searchParams, limit);
  return NextResponse.json(rows);
}
