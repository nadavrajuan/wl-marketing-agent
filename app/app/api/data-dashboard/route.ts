import { NextRequest, NextResponse } from "next/server";
import { getDataDashboard } from "@/lib/data-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await getDataDashboard(req.nextUrl.searchParams);
  return NextResponse.json(data);
}
