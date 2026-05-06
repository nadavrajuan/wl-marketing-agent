import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_INTERNAL_URL || "http://localhost:8001";
const TOKEN = process.env.INGEST_API_TOKEN || "";

export async function GET() {
  try {
    const res = await fetch(`${AGENT_URL}/agent/api/research/runs`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${AGENT_URL}/agent/api/research/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json(
        { error: `Agent error ${res.status}: ${text.slice(0, 500)}` },
        { status: 502 }
      );
    }
  } catch (e) {
    return NextResponse.json({ error: `Could not reach agent: ${String(e)}` }, { status: 502 });
  }
}
