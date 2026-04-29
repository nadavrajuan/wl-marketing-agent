"use client";
import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, Legend,
} from "recharts";

interface SegRow {
  segment: string;
  total_events: string;
  add_to_carts: string;
  gross_purchases: string;
  purchase_reversals: string;
  purchases: string;
  modeled_revenue: string;
  purchase_revenue: string;
}

const GROUP_OPTIONS = [
  { value: "platform_id", label: "Platform" },
  { value: "device", label: "Device" },
  { value: "match_type", label: "Match Type" },
  { value: "affiliate", label: "Affiliate" },
  { value: "funnel_step", label: "Funnel Step" },
  { value: "dti", label: "Landing Page Variant (DTI)" },
  { value: "utm_campaign", label: "Campaign (UTM)" },
  { value: "network", label: "Network" },
  { value: "user_country", label: "Country" },
];

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6"];

const LABEL_MAPS: Record<string, Record<string, string>> = {
  device: { c: "Desktop", m: "Mobile", t: "Tablet", desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" },
  match_type: { e: "Exact", p: "Phrase", b: "Broad" },
  network: { o: "Bing Search", g: "Google Search", s: "Syndication", a: "App" },
};

export default function SegmentsContent() {
  const [groupBy, setGroupBy] = useState("platform_id");
  const [data, setData] = useState<SegRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/segments?group_by=${groupBy}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [groupBy]);

  const label = (seg: string) => (LABEL_MAPS[groupBy] || {})[seg] || seg;

  const chartData = data.slice(0, 15).map((d) => ({
    name: label(d.segment),
    events: Number(d.total_events),
    purchases: Number(d.purchases),
    revenue: Number(d.purchase_revenue),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Segments</h1>
        <p className="text-gray-400 text-sm mt-1">Purchase and proxy mix across the key dimensions in the warehouse.</p>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm text-gray-400">Group by:</label>
        <select
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2"
          value={groupBy}
          onChange={(e) => {
            setLoading(true);
            setGroupBy(e.target.value);
          }}
        >
          {GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-400 p-8">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-300 mb-3">Event volume by {GROUP_OPTIONS.find((o) => o.value === groupBy)?.label}</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#d1d5db" }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="events" name="Events" radius={3}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-300 mb-3">Purchase revenue and purchases</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                  <Bar yAxisId="left" dataKey="purchases" fill="#10b981" name="Net purchases" radius={3} />
                  <Bar yAxisId="right" dataKey="revenue" fill="#f59e0b" name="Purchase revenue $" radius={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800">
                <tr className="text-gray-400">
                  <th className="text-left py-2 px-3 font-medium">Segment</th>
                  <th className="text-right py-2 px-3 font-medium">Events</th>
                  <th className="text-right py-2 px-3 font-medium">ATC</th>
                  <th className="text-right py-2 px-3 font-medium">Purchases</th>
                  <th className="text-right py-2 px-3 font-medium">Reversals</th>
                  <th className="text-right py-2 px-3 font-medium">Net Purchases</th>
                  <th className="text-right py-2 px-3 font-medium">Purchase Revenue</th>
                  <th className="text-right py-2 px-3 font-medium">Modeled Revenue</th>
                  <th className="text-right py-2 px-3 font-medium">Purchase Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const totalEvents = Number(row.total_events);
                  const purchases = Number(row.purchases);
                  const purchaseRate = totalEvents > 0 ? ((purchases / totalEvents) * 100).toFixed(2) : null;
                  return (
                    <tr key={row.segment} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 px-3 text-gray-200 font-medium">{label(row.segment)}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{totalEvents.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-amber-300">{Number(row.add_to_carts).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-emerald-300">{Number(row.gross_purchases).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-rose-300">{Number(row.purchase_reversals).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-medium">{purchases.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-yellow-400">${Number(row.purchase_revenue).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-gray-400">${Number(row.modeled_revenue).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right">
                        {purchaseRate ? (
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            Number(purchaseRate) >= 5 ? "bg-emerald-900 text-emerald-300" :
                            Number(purchaseRate) >= 2 ? "bg-blue-900 text-blue-300" :
                            "bg-gray-800 text-gray-400"
                          }`}>{purchaseRate}%</span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
