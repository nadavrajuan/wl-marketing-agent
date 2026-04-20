import { NextRequest, NextResponse } from "next/server";
import { getCopyIntelligence } from "@/lib/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await getCopyIntelligence(req.nextUrl.searchParams);
  return NextResponse.json(data);
}
