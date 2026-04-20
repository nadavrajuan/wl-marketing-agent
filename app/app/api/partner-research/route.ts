import { NextResponse } from "next/server";
import { getPartnerResearch } from "@/lib/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getPartnerResearch();
  return NextResponse.json(data);
}
