import { NextRequest, NextResponse } from "next/server";
import { getLandingPages } from "@/lib/weight-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rows = await getLandingPages(req.nextUrl.searchParams);
  return NextResponse.json(rows);
}
