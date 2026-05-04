import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_INTERNAL_URL || "http://localhost:8001";
const TOKEN = process.env.INGEST_API_TOKEN || "";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${AGENT_URL}/agent/api/search-queries/cluster`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
    // Clustering can take ~30s with large datasets
    signal: AbortSignal.timeout(90_000),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
