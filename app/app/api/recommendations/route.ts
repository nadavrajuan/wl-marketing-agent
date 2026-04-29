import { NextRequest, NextResponse } from "next/server";
import { getRecommendationCards } from "@/lib/recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await getRecommendationCards(req.nextUrl.searchParams);
  return NextResponse.json(data);
}
