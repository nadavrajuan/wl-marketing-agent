import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const groupBy = params.get("group_by") || "platform_id";

  const ALLOWED_GROUPS = [
    "platform_id", "device", "match_type", "affiliate",
    "funnel_step", "utm_campaign", "keyword", "dti", "network", "user_country",
  ];
  if (!ALLOWED_GROUPS.includes(groupBy)) {
    return NextResponse.json({ error: "Invalid group_by" }, { status: 400 });
  }

  const sql = `
    SELECT
      COALESCE(${groupBy}::text, 'unknown') AS segment,
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS quiz_starts,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Complete') AS quiz_completes,
      COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
      COALESCE(SUM(value), 0) AS revenue,
      ROUND(
        COALESCE(AVG(value) FILTER (WHERE value > 0), 0)::numeric, 2
      ) AS avg_order_value
    FROM conversions
    GROUP BY ${groupBy}
    ORDER BY total_events DESC
    LIMIT 50
  `;

  const { rows } = await pool.query(sql);
  return NextResponse.json(rows);
}
