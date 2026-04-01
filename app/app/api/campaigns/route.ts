import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const conditions: string[] = ["campaign_id IS NOT NULL"];
  const values: unknown[] = [];
  let idx = 1;

  const platform = params.get("platform");
  if (platform) { conditions.push(`platform_id = $${idx++}`); values.push(platform); }
  const dateFrom = params.get("date_from");
  if (dateFrom) { conditions.push(`conversion_at >= $${idx++}`); values.push(dateFrom); }
  const dateTo = params.get("date_to");
  if (dateTo) { conditions.push(`conversion_at <= $${idx++}`); values.push(dateTo); }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const sql = `
    SELECT
      campaign_id,
      MAX(utm_campaign) AS campaign_name,
      MAX(platform_id) AS platform,
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS quiz_starts,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Complete') AS quiz_completes,
      COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
      COALESCE(SUM(value), 0) AS revenue,
      ROUND(
        COALESCE(AVG(value) FILTER (WHERE value > 0), 0)::numeric, 2
      ) AS avg_order_value,
      COUNT(DISTINCT adgroup_id) AS adgroup_count,
      COUNT(DISTINCT keyword) AS keyword_count,
      ROUND(
        COUNT(*) FILTER (WHERE funnel_step = 'Quiz Complete')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start'), 0) * 100, 1
      ) AS quiz_completion_rate,
      ROUND(
        COUNT(*) FILTER (WHERE funnel_step = 'Purchase')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start'), 0) * 100, 2
      ) AS purchase_rate
    FROM conversions
    ${where}
    GROUP BY campaign_id
    ORDER BY total_events DESC
  `;

  const { rows } = await pool.query(sql, values);
  return NextResponse.json(rows);
}
