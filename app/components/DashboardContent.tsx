"use client";
import { useEffect, useState } from "react";
import StatCard from "./StatCard";
import DailyChart from "./DailyChart";
import PlatformPie from "./PlatformPie";
import FunnelChart from "./FunnelChart";
import TopKeywordsTable from "./TopKeywordsTable";

interface Stats {
  totalEvents: number;
  quizStarts: number;
  quizCompletes: number;
  addToCarts: number;
  purchases: number;
  leads: number;
  totalRevenue: number;
  avgOrderValue: number;
  uniqueCampaigns: number;
  uniqueKeywords: number;
  quizCompletionRate: string;
  purchaseRate: string;
  dateMin: string;
  dateMax: string;
}

export default function DashboardContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); });
  }, []);

  if (loading) return <div className="text-gray-400 mt-10 text-center">Loading dashboard...</div>;
  if (!stats) return null;

  const dateRange = stats.dateMin
    ? `${new Date(stats.dateMin).toLocaleDateString()} – ${new Date(stats.dateMax).toLocaleDateString()}`
    : "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">{dateRange} · Bing + Google Ads · Weight Loss PPC</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Revenue"
          value={`$${stats.totalRevenue.toLocaleString()}`}
          sub={`Avg order: $${stats.avgOrderValue}`}
          color="green"
        />
        <StatCard
          label="Purchases"
          value={stats.purchases.toLocaleString()}
          sub={`${stats.purchaseRate}% of quiz starts`}
          color="blue"
        />
        <StatCard
          label="Quiz Completion Rate"
          value={`${stats.quizCompletionRate}%`}
          sub={`${stats.quizCompletes.toLocaleString()} / ${stats.quizStarts.toLocaleString()}`}
          color="purple"
        />
        <StatCard
          label="Total Events"
          value={stats.totalEvents.toLocaleString()}
          sub={`${stats.uniqueCampaigns} campaigns · ${stats.uniqueKeywords} keywords`}
          color="orange"
        />
      </div>

      {/* Funnel Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Quiz Starts" value={stats.quizStarts.toLocaleString()} />
        <StatCard label="Quiz Completes" value={stats.quizCompletes.toLocaleString()} />
        <StatCard label="Add to Cart" value={stats.addToCarts.toLocaleString()} />
        <StatCard label="Leads" value={stats.leads.toLocaleString()} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Daily Events & Revenue</div>
          <DailyChart />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Platform Split</div>
          <PlatformPie />
        </div>
      </div>

      {/* Funnel + Keywords */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Conversion Funnel</div>
          <FunnelChart stats={stats} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Top Keywords by Volume</div>
          <TopKeywordsTable />
        </div>
      </div>
    </div>
  );
}
