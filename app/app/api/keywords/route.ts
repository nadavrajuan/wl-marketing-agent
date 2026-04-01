import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const conditions: string[] = ["keyword IS NOT NULL"];
  const values: unknown[] = [];
  let idx = 1;

  const platform = params.get("platform");
  if (platform) { conditions.push(`platform_id = $${idx++}`); values.push(platform); }
  const matchType = params.get("match_type");
  if (matchType) { conditions.push(`match_type = $${idx++}`); values.push(matchType); }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const sql = `
    SELECT
      keyword,
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS quiz_starts,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Complete') AS quiz_completes,
      COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
      COALESCE(SUM(value), 0) AS revenue,
      ROUND(
        COUNT(*) FILTER (WHERE funnel_step = 'Purchase')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start'), 0) * 100, 2
      ) AS purchase_rate
    FROM conversions
    ${where}
    GROUP BY keyword
    ORDER BY total_events DESC
    LIMIT 100
  `;

  const { rows } = await pool.query(sql, values);
  return NextResponse.json(rows);
}
