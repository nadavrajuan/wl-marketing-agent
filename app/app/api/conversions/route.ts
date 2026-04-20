import { NextRequest, NextResponse } from "next/server";
import { getConversions } from "@/lib/weight-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await getConversions(req.nextUrl.searchParams);
  return NextResponse.json(data);
}
