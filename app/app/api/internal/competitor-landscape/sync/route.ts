import { NextRequest, NextResponse } from "next/server";
import { syncCompetitorLandscape } from "@/lib/competitor-landscape";

function isAuthorized(request: NextRequest) {
  const accepted = [
    process.env.COMPETITOR_SYNC_TOKEN,
    process.env.INGEST_API_TOKEN,
  ].filter((value): value is string => Boolean(value));
  if (accepted.length === 0) return false;
  const header = request.headers.get("x-sync-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header != null && accepted.includes(header);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncCompetitorLandscape();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Competitor sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
