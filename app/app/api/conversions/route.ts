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

  const matchType = params.get("match_type");
  if (matchType) { conditions.push(`match_type = $${idx++}`); values.push(matchType); }

  const affiliate = params.get("affiliate");
  if (affiliate) { conditions.push(`affiliate = $${idx++}`); values.push(affiliate); }

  const funnelStep = params.get("funnel_step");
  if (funnelStep) { conditions.push(`funnel_step = $${idx++}`); values.push(funnelStep); }

  const campaignId = params.get("campaign_id");
  if (campaignId) { conditions.push(`campaign_id = $${idx++}`); values.push(Number(campaignId)); }

  const keyword = params.get("keyword");
  if (keyword) { conditions.push(`keyword ILIKE $${idx++}`); values.push(`%${keyword}%`); }

  const dateFrom = params.get("date_from");
  if (dateFrom) { conditions.push(`conversion_at >= $${idx++}`); values.push(dateFrom); }

  const dateTo = params.get("date_to");
  if (dateTo) { conditions.push(`conversion_at <= $${idx++}`); values.push(dateTo); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Number(params.get("limit") || 50));
  const offset = (page - 1) * limit;

  const countSql = `SELECT COUNT(*) FROM conversions ${where}`;
  const dataSql = `
    SELECT
      id, conversion_at, funnel_step, affiliate, value, platform_id,
      device, match_type, keyword, utm_campaign, campaign_id, adgroup_id,
      dti, landing_page_path, user_country
    FROM conversions
    ${where}
    ORDER BY conversion_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  const [countResult, dataResult] = await Promise.all([
    pool.query(countSql, values),
    pool.query(dataSql, [...values, limit, offset]),
  ]);

  return NextResponse.json({
    total: Number(countResult.rows[0].count),
    page,
    limit,
    rows: dataResult.rows,
  });
}
