import { NextRequest, NextResponse } from "next/server";
import { upsertRecommendationFeedback } from "@/lib/recommendation-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      recommendation_id?: string;
      verdict?: "good" | "ok" | "bad";
      note?: string | null;
      area?: string | null;
      title?: string | null;
    };

    if (!body.recommendation_id || !body.verdict) {
      return NextResponse.json(
        { error: "recommendation_id and verdict are required." },
        { status: 400 },
      );
    }

    if (!["good", "ok", "bad"].includes(body.verdict)) {
      return NextResponse.json({ error: "Invalid verdict." }, { status: 400 });
    }

    const record = await upsertRecommendationFeedback({
      recommendation_id: body.recommendation_id,
      verdict: body.verdict,
      note: body.note || null,
      area: body.area || null,
      title: body.title || null,
    });

    return NextResponse.json(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save recommendation feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
