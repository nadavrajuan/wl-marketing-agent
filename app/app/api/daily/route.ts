import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const platform = params.get("platform");
  if (platform) { conditions.push(`platform_id = $${idx++}`); values.push(platform); }
  const device = params.get("device");
  if (device) { conditions.push(`device = $${idx++}`); values.push(device); }
  const dateFrom = params.get("date_from");
  if (dateFrom) { conditions.push(`conversion_at >= $${idx++}`); values.push(dateFrom); }
  const dateTo = params.get("date_to");
  if (dateTo) { conditions.push(`conversion_at <= $${idx++}`); values.push(dateTo); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      DATE(conversion_at AT TIME ZONE 'UTC') AS date,
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS quiz_starts,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Complete') AS quiz_completes,
      COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
      COALESCE(SUM(value), 0) AS revenue
    FROM conversions
    ${where}
    GROUP BY DATE(conversion_at AT TIME ZONE 'UTC')
    ORDER BY date
  `;

  const { rows } = await pool.query(sql, values);
  return NextResponse.json(rows);
}
