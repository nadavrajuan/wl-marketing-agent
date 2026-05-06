import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_INTERNAL_URL || "http://localhost:8001";
const TOKEN = process.env.INGEST_API_TOKEN || "";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const body = await req.json();
  const res = await fetch(`${AGENT_URL}/agent/api/research/templates/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const res = await fetch(`${AGENT_URL}/agent/api/research/templates/${templateId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
