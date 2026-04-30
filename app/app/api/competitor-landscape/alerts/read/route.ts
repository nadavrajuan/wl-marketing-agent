import { NextRequest, NextResponse } from "next/server";
import { markCompetitorAlertsRead } from "@/lib/competitor-landscape";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    await markCompetitorAlertsRead({
      ids: Array.isArray(body?.ids) ? body.ids.map((value: unknown) => Number(value)).filter(Number.isFinite) : undefined,
      mark_all: Boolean(body?.mark_all),
      read_by: typeof body?.read_by === "string" ? body.read_by : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark alerts as read.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
