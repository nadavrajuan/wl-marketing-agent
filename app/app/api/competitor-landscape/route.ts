import { NextResponse } from "next/server";
import { getCompetitorLandscapeData } from "@/lib/competitor-landscape";

export async function GET() {
  try {
    const data = await getCompetitorLandscapeData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load competitor landscape.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
