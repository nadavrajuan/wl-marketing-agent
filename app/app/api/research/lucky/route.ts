import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_INTERNAL_URL || "http://localhost:8001";
const TOKEN = process.env.INGEST_API_TOKEN || "";

export async function GET() {
  const res = await fetch(`${AGENT_URL}/agent/api/research/lucky`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    next: { revalidate: 0 },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
