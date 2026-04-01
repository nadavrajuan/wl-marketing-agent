import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

function buildWhere(params: URLSearchParams) {
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

  const campaign = params.get("campaign_id");
  if (campaign) { conditions.push(`campaign_id = $${idx++}`); values.push(Number(campaign)); }

  const keyword = params.get("keyword");
  if (keyword) { conditions.push(`keyword ILIKE $${idx++}`); values.push(`%${keyword}%`); }

  const dateFrom = params.get("date_from");
  if (dateFrom) { conditions.push(`conversion_at >= $${idx++}`); values.push(dateFrom); }

  const dateTo = params.get("date_to");
  if (dateTo) { conditions.push(`conversion_at <= $${idx++}`); values.push(dateTo); }

  const dti = params.get("dti");
  if (dti) { conditions.push(`dti = $${idx++}`); values.push(dti); }

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const { where, values } = buildWhere(params);

  const sql = `
    SELECT
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS quiz_starts,
      COUNT(*) FILTER (WHERE funnel_step = 'Quiz Complete') AS quiz_completes,
      COUNT(*) FILTER (WHERE funnel_step = 'Add to Cart') AS add_to_carts,
      COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
      COUNT(*) FILTER (WHERE funnel_step = 'Lead') AS leads,
      COALESCE(SUM(value), 0) AS total_revenue,
      COALESCE(AVG(value) FILTER (WHERE value > 0), 0) AS avg_order_value,
      COUNT(DISTINCT campaign_id) AS unique_campaigns,
      COUNT(DISTINCT keyword) AS unique_keywords,
      MIN(conversion_at) AS date_min,
      MAX(conversion_at) AS date_max
    FROM conversions
    ${where}
  `;

  const { rows } = await pool.query(sql, values);
  const row = rows[0];

  const quizStarts = Number(row.quiz_starts);
  const purchases = Number(row.purchases);
  const quizCompletes = Number(row.quiz_completes);

  return NextResponse.json({
    totalEvents: Number(row.total_events),
    quizStarts,
    quizCompletes,
    addToCarts: Number(row.add_to_carts),
    purchases,
    leads: Number(row.leads),
    totalRevenue: Number(row.total_revenue),
    avgOrderValue: Number(Number(row.avg_order_value).toFixed(2)),
    uniqueCampaigns: Number(row.unique_campaigns),
    uniqueKeywords: Number(row.unique_keywords),
    quizCompletionRate: quizStarts > 0 ? ((quizCompletes / quizStarts) * 100).toFixed(1) : "0",
    purchaseRate: quizStarts > 0 ? ((purchases / quizStarts) * 100).toFixed(2) : "0",
    dateMin: row.date_min,
    dateMax: row.date_max,
  });
}
