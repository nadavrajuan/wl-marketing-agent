import { NextRequest, NextResponse } from "next/server";
import { getStats } from "@/lib/weight-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const row = await getStats(req.nextUrl.searchParams);

  const quizStarts = Number(row.quiz_starts);
  const purchases = Number(row.net_purchases);
  const quizCompletes = Number(row.quiz_completes);

  return NextResponse.json({
    totalEvents: Number(row.total_events),
    quizStarts,
    quizCompletes,
    addToCarts: Number(row.add_to_carts),
    purchases,
    grossPurchases: Number(row.gross_purchases),
    purchaseReversals: Number(row.purchase_reversals),
    leads: Number(row.leads),
    totalRevenue: Number(row.modeled_revenue),
    avgOrderValue: Number(Number(row.avg_order_value).toFixed(2)),
    uniqueCampaigns: Number(row.unique_campaigns),
    uniqueKeywords: Number(row.unique_keywords),
    quizCompletionRate: quizStarts > 0 ? ((quizCompletes / quizStarts) * 100).toFixed(1) : "0",
    purchaseRate: quizStarts > 0 ? ((purchases / quizStarts) * 100).toFixed(2) : "0",
    dateMin: row.date_min,
    dateMax: row.date_max,
  });
}
