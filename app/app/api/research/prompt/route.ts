import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_INTERNAL_URL || "http://localhost:8001";
const TOKEN = process.env.INGEST_API_TOKEN || "";

export async function GET() {
  const res = await fetch(`${AGENT_URL}/agent/api/research/prompt`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    next: { revalidate: 0 },
  });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${AGENT_URL}/agent/api/research/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
